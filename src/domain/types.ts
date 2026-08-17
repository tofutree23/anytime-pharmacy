export type DayHours = { open: string; close: string };

export type DutyTime = {
  mon: DayHours | null;
  tue: DayHours | null;
  wed: DayHours | null;
  thu: DayHours | null;
  fri: DayHours | null;
  sat: DayHours | null;
  sun: DayHours | null;
  holiday: DayHours | null;
};

export type Pharmacy = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  lat: number;
  lng: number;
  dutyTime: DutyTime;
  source: string;
  updatedAt: string;
  /** 기준 위치(GPS)로부터의 거리(m). 지역 조회처럼 기준점이 없으면 null. */
  distanceMeters: number | null;
};
