import { describe, expect, it } from 'vitest';
import { isOpenNow, isNightHours, isHolidayOpen } from './businessHours';
import type { DutyTime } from './types';

const baseDutyTime: DutyTime = {
  mon: { open: '0900', close: '1800' },
  tue: { open: '0900', close: '1800' },
  wed: { open: '0900', close: '1800' },
  thu: { open: '0900', close: '1800' },
  fri: { open: '0900', close: '2300' },
  sat: null,
  sun: null,
  holiday: null,
};

describe('isOpenNow', () => {
  it('영업시간 내면 true를 반환한다', () => {
    // 2026-08-17은 월요일
    const now = new Date('2026-08-17T10:00:00+09:00');
    expect(isOpenNow(baseDutyTime, now)).toBe(true);
  });

  it('영업시간 밖이면 false를 반환한다', () => {
    const now = new Date('2026-08-17T20:00:00+09:00');
    expect(isOpenNow(baseDutyTime, now)).toBe(false);
  });

  it('해당 요일이 휴무(null)이면 false를 반환한다', () => {
    // 2026-08-15는 토요일
    const now = new Date('2026-08-15T10:00:00+09:00');
    expect(isOpenNow(baseDutyTime, now)).toBe(false);
  });
});

describe('isNightHours', () => {
  it('기본 심야 기준(22:00) 이후 영업하면 true를 반환한다', () => {
    // 2026-08-21은 금요일, 23:00까지 영업
    const now = new Date('2026-08-21T22:30:00+09:00');
    expect(isNightHours(baseDutyTime, now)).toBe(true);
  });

  it('심야 기준 이전에 영업이 끝나면 false를 반환한다', () => {
    // 2026-08-17은 월요일, 18:00까지 영업
    const now = new Date('2026-08-17T22:30:00+09:00');
    expect(isNightHours(baseDutyTime, now)).toBe(false);
  });
});

describe('isHolidayOpen', () => {
  it('holiday 필드가 있으면 true를 반환한다', () => {
    const dutyTime: DutyTime = { ...baseDutyTime, holiday: { open: '1000', close: '1300' } };
    expect(isHolidayOpen(dutyTime)).toBe(true);
  });

  it('holiday 필드가 null이면 false를 반환한다', () => {
    expect(isHolidayOpen(baseDutyTime)).toBe(false);
  });
});
