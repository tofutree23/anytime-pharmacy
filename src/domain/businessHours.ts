import type { DayHours, DutyTime } from './types';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/**
 * 주어진 Date를 한국 표준시(KST, UTC+9)로 변환하여
 * 요일(0-6)과 시간(0-23), 분(0-59)을 반환한다.
 *
 * host의 local timezone에 상관없이 항상 KST로 계산한다.
 */
function getKstDateParts(date: Date): { dayOfWeek: number; hours: number; minutes: number } {
  // Intl.DateTimeFormat을 사용하여 KST로 명시적 변환
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  parts.forEach(({ type, value }) => {
    partMap[type] = value;
  });

  const year = Number(partMap.year);
  const month = Number(partMap.month) - 1; // 0-indexed
  const day = Number(partMap.day);
  const hours = Number(partMap.hour);
  const minutes = Number(partMap.minute);

  // 요일 계산 (Tomohiko Sakamoto's algorithm)
  // Date 객체 사용 안 함: UTC Date로 요일을 계산하면 틀릴 수 있음
  // 대신 년/월/일 숫자로 직접 계산
  const q = day;
  const m = month < 2 ? month + 13 : month + 1;
  const y = month < 2 ? year - 1 : year;
  const K = y % 100;
  const J = Math.floor(y / 100);
  const h = (q + Math.floor((13 * (m + 1)) / 5) + K + Math.floor(K / 4) + Math.floor(J / 4) - 2 * J) % 7;
  const dayOfWeek = (h + 6) % 7; // 0 = Sunday

  return { dayOfWeek, hours, minutes };
}

function todayHours(dutyTime: DutyTime, now: Date): DayHours | null {
  const { dayOfWeek } = getKstDateParts(now);
  const key = DAY_KEYS[dayOfWeek];
  return dutyTime[key];
}

function yesterdayHours(dutyTime: DutyTime, now: Date): DayHours | null {
  const { dayOfWeek } = getKstDateParts(now);
  const yesterdayDayOfWeek = (dayOfWeek - 1 + 7) % 7;
  const key = DAY_KEYS[yesterdayDayOfWeek];
  return dutyTime[key];
}

function toMinutes(hhmm: string): number {
  const hours = Number(hhmm.slice(0, 2));
  const minutes = Number(hhmm.slice(2, 4));
  return hours * 60 + minutes;
}

function nowMinutes(now: Date): number {
  const { hours, minutes } = getKstDateParts(now);
  return hours * 60 + minutes;
}

export function isOpenNow(dutyTime: DutyTime, now: Date): boolean {
  const current = nowMinutes(now);
  const hours = todayHours(dutyTime, now);

  // Case 1: 오늘 영업시간이 정의됨
  if (hours) {
    const open = toMinutes(hours.open);
    const close = toMinutes(hours.close);

    if (close < open) {
      // 오늘이 자정을 넘기는 경우 (예: 22:00 ~ 02:00)
      // 이 shift는 오늘 "open" 시간부터 내일 "close" 시간까지
      if (current >= open) {
        // 현재가 오늘의 저녁/밤 시간대 (22:00 이후)
        return true;
      }

      // current < open: 현재가 early morning (예: 01:00)
      // 아직 오늘의 shift가 시작되지 않았지만,
      // 어제의 shift가 오늘까지 계속되고 있을 수 있음
      const yesterdayHour = yesterdayHours(dutyTime, now);
      if (yesterdayHour) {
        const yesterdayOpen = toMinutes(yesterdayHour.open);
        const yesterdayClose = toMinutes(yesterdayHour.close);

        if (yesterdayClose < yesterdayOpen) {
          // 어제도 자정을 넘기는 경우
          // 어제 shift: 어제 open ~ 오늘 close
          if (current <= yesterdayClose) {
            // 현재가 어제의 close 시간 이전 → 어제 밤 계속 영업중
            return true;
          }
        }
      }

      return false;
    }

    // 오늘이 정상적인 영업시간 (같은 날짜 내)
    return current >= open && current <= close;
  }

  // Case 2: 오늘 영업시간이 없으면, 어제 밤 자정 넘김 여부 확인
  // 어제의 영업시간이 자정을 넘기는 경우 (close < open),
  // 어제의 shift는 어제 "open"부터 오늘 "close"까지
  // 현재가 오늘 early morning이고, 현재 시간이 어제의 close 시간 이전이면 영업중
  const yesterdayHour = yesterdayHours(dutyTime, now);
  if (!yesterdayHour) return false;

  const yesterdayOpen = toMinutes(yesterdayHour.open);
  const yesterdayClose = toMinutes(yesterdayHour.close);

  // 어제가 자정을 넘기는 경우만 확인
  if (yesterdayClose < yesterdayOpen) {
    // 어제의 shift: 어제 open ~ 오늘 close
    // 현재 시간이 어제의 close 시간 이전이면 어제 밤부터 계속 영업중
    return current <= yesterdayClose;
  }

  return false;
}

export function isNightHours(dutyTime: DutyTime, now: Date, nightStartHHmm = '2200'): boolean {
  const hours = todayHours(dutyTime, now);
  if (!hours) return false;

  const nightStart = toMinutes(nightStartHHmm);
  const close = toMinutes(hours.close);

  // 마감 시간이 심야 기준 이후(또는 자정을 넘김)면 심야 영업으로 간주
  return close >= nightStart || close < toMinutes(hours.open);
}

export function isHolidayOpen(dutyTime: DutyTime): boolean {
  return dutyTime.holiday !== null;
}
