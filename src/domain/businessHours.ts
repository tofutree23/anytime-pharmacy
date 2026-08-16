import type { DayHours, DutyTime } from './types';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function todayHours(dutyTime: DutyTime, now: Date): DayHours | null {
  const key = DAY_KEYS[now.getDay()];
  return dutyTime[key];
}

function toMinutes(hhmm: string): number {
  const hours = Number(hhmm.slice(0, 2));
  const minutes = Number(hhmm.slice(2, 4));
  return hours * 60 + minutes;
}

function nowMinutes(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

export function isOpenNow(dutyTime: DutyTime, now: Date): boolean {
  const hours = todayHours(dutyTime, now);
  if (!hours) return false;

  const current = nowMinutes(now);
  const open = toMinutes(hours.open);
  const close = toMinutes(hours.close);

  if (close < open) {
    // 자정을 넘겨 영업하는 경우 (예: 22:00 ~ 02:00)
    return current >= open || current <= close;
  }
  return current >= open && current <= close;
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
