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
};
