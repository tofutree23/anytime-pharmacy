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

/**
 * KST 기준 오늘 요일에 해당하는 DutyTime 키를 반환한다('holiday' 제외).
 * 화면에서 "오늘" 행을 강조하는 등 요일별 UI에 재사용한다.
 */
export function getTodayDutyKey(now: Date): Exclude<keyof DutyTime, 'holiday'> {
  const { dayOfWeek } = getKstDateParts(now);
  return DAY_KEYS[dayOfWeek];
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

/**
 * 어제 시작한 자정 넘김 shift가 현재까지 이어지고 있는지 확인한다.
 * 어제 영업시간이 자정을 넘기면(close < open) 그 shift는 어제 open부터
 * 오늘 close까지 이어지므로, 현재가 어제의 close 이전이면 영업중이다.
 */
function isCoveredByYesterdayOvernight(dutyTime: DutyTime, now: Date, current: number): boolean {
  const yesterdayHour = yesterdayHours(dutyTime, now);
  if (!yesterdayHour) return false;

  const yesterdayOpen = toMinutes(yesterdayHour.open);
  const yesterdayClose = toMinutes(yesterdayHour.close);

  // 어제가 자정을 넘기지 않으면 오늘까지 이어질 수 없다.
  if (yesterdayClose >= yesterdayOpen) return false;

  return current <= yesterdayClose;
}

export function isOpenNow(dutyTime: DutyTime, now: Date): boolean {
  const current = nowMinutes(now);
  const hours = todayHours(dutyTime, now);

  // 1) 오늘 자체 영업시간으로 커버되는지 먼저 확인한다.
  if (hours) {
    const open = toMinutes(hours.open);
    const close = toMinutes(hours.close);

    if (close < open) {
      // 오늘이 자정을 넘기는 경우 (예: 22:00 ~ 02:00).
      // 이 shift는 오늘 open부터 내일 close까지이므로 open 이후면 영업중.
      if (current >= open) return true;
    } else if (current >= open && current <= close) {
      // 같은 날짜 안에서 끝나는 정상 영업시간
      return true;
    }
  }

  // 2) 오늘 영업시간이 없거나 아직 시작 전(또는 이미 종료)이라면,
  //    어제 시작한 자정 넘김 shift가 아직 이어지는지 확인한다.
  //    오늘 영업시간이 자정을 넘기는지 여부와 무관하게 동일하게 적용한다.
  //    (예: 월 22:00~02:00, 화 09:00~18:00 → 화요일 01:00은 영업중)
  return isCoveredByYesterdayOvernight(dutyTime, now, current);
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
