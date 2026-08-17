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

describe('midnight-crossing logic (자정 넘김 영업)', () => {
  it('어제가 22:00-02:00이고 오늘이 휴무일 때, 오늘 01:00은 영업 중이다', () => {
    // 2026-08-17은 월요일 22:00~02:00
    // 2026-08-18은 화요일 null (휴무)
    // 화요일 01:00은 월요일 밤부터 계속 영업중
    const midnightCrossingDutyTime: DutyTime = {
      mon: { open: '2200', close: '0200' },
      tue: null, // 화요일은 휴무
      wed: { open: '0900', close: '1800' },
      thu: { open: '0900', close: '1800' },
      fri: { open: '0900', close: '2300' },
      sat: null,
      sun: null,
      holiday: null,
    };
    // 2026-08-18 01:00 (화요일 새벽 1시, 월요일 밤의 연속)
    const now = new Date('2026-08-18T01:00:00+09:00');
    expect(isOpenNow(midnightCrossingDutyTime, now)).toBe(true);
  });

  it('오늘이 22:00-02:00일 때, 오늘 01:00은 영업하지 않는다 (아직 시작 안 됨)', () => {
    // 오늘이 22:00-02:00이지만, 01:00은 아직 오늘의 영업 시간 시작 전
    // (월요일을 지나 화요일 01:00이면, 화요일 22:00 이전이므로 영업하지 않음)
    const dutyTime: DutyTime = {
      mon: { open: '0900', close: '1800' },
      tue: { open: '2200', close: '0200' }, // 화요일 22:00-02:00
      wed: { open: '0900', close: '1800' },
      thu: { open: '0900', close: '1800' },
      fri: { open: '0900', close: '2300' },
      sat: null,
      sun: null,
      holiday: null,
    };
    // 2026-08-18 01:00 (화요일 새벽 1시)
    // 화요일은 22:00부터 시작하는데, 01:00은 전날(월요일) 밤 확장이 아니라
    // 오늘 기준 아직 시작 안 된 것
    const now = new Date('2026-08-18T01:00:00+09:00');
    expect(isOpenNow(dutyTime, now)).toBe(false);
  });
});

describe('KST timezone handling', () => {
  it('KST와 UTC 차이를 올바르게 처리한다', () => {
    // 같은 시점을 KST와 UTC ISO string으로 표현
    // 2026-08-17T10:00:00+09:00 === 2026-08-17T01:00:00Z (월요일 10시 KST)
    const dutyTime: DutyTime = {
      mon: { open: '0900', close: '1800' },
      tue: { open: '0900', close: '1800' },
      wed: { open: '0900', close: '1800' },
      thu: { open: '0900', close: '1800' },
      fri: { open: '0900', close: '2300' },
      sat: null,
      sun: null,
      holiday: null,
    };

    // KST로 명시 (월요일 10시)
    const kstDate = new Date('2026-08-17T10:00:00+09:00');
    expect(isOpenNow(dutyTime, kstDate)).toBe(true);

    // 같은 순간을 UTC로 표현해도 동일한 결과
    const utcDate = new Date('2026-08-17T01:00:00Z');
    expect(isOpenNow(dutyTime, utcDate)).toBe(true);
  });

  it('토요일 표준 시간대는 호스트 TZ에 관계없이 올바르게 판단된다', () => {
    const dutyTime: DutyTime = {
      mon: { open: '0900', close: '1800' },
      tue: { open: '0900', close: '1800' },
      wed: { open: '0900', close: '1800' },
      thu: { open: '0900', close: '1800' },
      fri: { open: '0900', close: '2300' },
      sat: null, // 토요일은 휴무
      sun: null,
      holiday: null,
    };

    // 2026-08-15는 토요일 12:00 KST
    const now = new Date('2026-08-15T12:00:00+09:00');
    expect(isOpenNow(dutyTime, now)).toBe(false); // 토요일이므로 휴무
  });
});

describe('every-day-crosses-midnight regression', () => {
  it('매일 22:00-02:00인 약국: 화요일 01:00은 영업 중이다 (월요일 밤 계속)', () => {
    // 가장 일반적인 24시간 편의점/심야약국 패턴
    // 모든 요일이 동일한 자정 넘김 영업시간
    const everydayOvernightDutyTime: DutyTime = {
      mon: { open: '2200', close: '0200' },
      tue: { open: '2200', close: '0200' },
      wed: { open: '2200', close: '0200' },
      thu: { open: '2200', close: '0200' },
      fri: { open: '2200', close: '0200' },
      sat: { open: '2200', close: '0200' },
      sun: { open: '2200', close: '0200' },
      holiday: { open: '2200', close: '0200' },
    };

    // 2026-08-18은 화요일 01:00
    // 월요일 22:00 ~ 화요일 02:00 shift가 계속 진행 중
    const now = new Date('2026-08-18T01:00:00+09:00');
    expect(isOpenNow(everydayOvernightDutyTime, now)).toBe(true);
  });

  it('매일 22:00-02:00인 약국: 화요일 23:00도 영업 중이다 (화요일 자신의 shift)', () => {
    // 화요일 23:00은 화요일 자신의 22:00-02:00 shift 범위 내
    const everydayOvernightDutyTime: DutyTime = {
      mon: { open: '2200', close: '0200' },
      tue: { open: '2200', close: '0200' },
      wed: { open: '2200', close: '0200' },
      thu: { open: '2200', close: '0200' },
      fri: { open: '2200', close: '0200' },
      sat: { open: '2200', close: '0200' },
      sun: { open: '2200', close: '0200' },
      holiday: { open: '2200', close: '0200' },
    };

    // 2026-08-18은 화요일 23:00
    const now = new Date('2026-08-18T23:00:00+09:00');
    expect(isOpenNow(everydayOvernightDutyTime, now)).toBe(true);
  });

  it('매일 22:00-02:00인 약국: 화요일 03:00은 영업 종료 (위요일 shift 끝남)', () => {
    // 화요일 03:00은 이미 화요일 02:00 close time 이후
    const everydayOvernightDutyTime: DutyTime = {
      mon: { open: '2200', close: '0200' },
      tue: { open: '2200', close: '0200' },
      wed: { open: '2200', close: '0200' },
      thu: { open: '2200', close: '0200' },
      fri: { open: '2200', close: '0200' },
      sat: { open: '2200', close: '0200' },
      sun: { open: '2200', close: '0200' },
      holiday: { open: '2200', close: '0200' },
    };

    // 2026-08-18은 화요일 03:00
    const now = new Date('2026-08-18T03:00:00+09:00');
    expect(isOpenNow(everydayOvernightDutyTime, now)).toBe(false);
  });

  it('매일 22:00-02:00인 약국: 화요일 10:00은 영업 종료 (다음 shift 전)', () => {
    // 화요일 10:00은 화요일 22:00까지 폐업
    const everydayOvernightDutyTime: DutyTime = {
      mon: { open: '2200', close: '0200' },
      tue: { open: '2200', close: '0200' },
      wed: { open: '2200', close: '0200' },
      thu: { open: '2200', close: '0200' },
      fri: { open: '2200', close: '0200' },
      sat: { open: '2200', close: '0200' },
      sun: { open: '2200', close: '0200' },
      holiday: { open: '2200', close: '0200' },
    };

    // 2026-08-18은 화요일 10:00
    const now = new Date('2026-08-18T10:00:00+09:00');
    expect(isOpenNow(everydayOvernightDutyTime, now)).toBe(false);
  });

  it('어제만 자정을 넘기고 오늘은 정상 영업시간인 경우: 이른 아침은 어제 shift로 영업 중이다', () => {
    // 월 22:00-02:00 (자정 넘김), 화 09:00-18:00 (정상)
    // 화요일 01:00 → 월요일 밤 shift가 아직 진행 중이므로 영업 중
    const dutyTime: DutyTime = {
      mon: { open: '2200', close: '0200' },
      tue: { open: '0900', close: '1800' },
      wed: null,
      thu: null,
      fri: null,
      sat: null,
      sun: null,
      holiday: null,
    };

    // 2026-08-18은 화요일 01:00
    const now = new Date('2026-08-18T01:00:00+09:00');
    expect(isOpenNow(dutyTime, now)).toBe(true);
  });

  it('어제가 자정을 넘기지 않으면 이른 아침에 false를 반환한다 (오탐 없음)', () => {
    // 월 09:00-18:00 (정상), 화 휴무
    // 화요일 01:00 → 월요일 shift는 이미 종료됐으므로 영업 종료
    const dutyTime: DutyTime = {
      mon: { open: '0900', close: '1800' },
      tue: null,
      wed: null,
      thu: null,
      fri: null,
      sat: null,
      sun: null,
      holiday: null,
    };

    const now = new Date('2026-08-18T01:00:00+09:00');
    expect(isOpenNow(dutyTime, now)).toBe(false);
  });

  it('어제 자정 넘김 shift가 끝난 뒤 오늘 영업 시작 전이면 false를 반환한다', () => {
    // 월 22:00-02:00, 화 09:00-18:00 → 화요일 05:00은 어느 shift에도 속하지 않음
    const dutyTime: DutyTime = {
      mon: { open: '2200', close: '0200' },
      tue: { open: '0900', close: '1800' },
      wed: null,
      thu: null,
      fri: null,
      sat: null,
      sun: null,
      holiday: null,
    };

    const now = new Date('2026-08-18T05:00:00+09:00');
    expect(isOpenNow(dutyTime, now)).toBe(false);
  });
});
