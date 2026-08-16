export type RawPharmacyItem = {
  hpid: string;
  dutyName: string;
  dutyAddr: string;
  dutyTel1: string;
  wgs84Lon: string;
  wgs84Lat: string;
  dutyTime1s: string; dutyTime1c: string;
  dutyTime2s: string; dutyTime2c: string;
  dutyTime3s: string; dutyTime3c: string;
  dutyTime4s: string; dutyTime4c: string;
  dutyTime5s: string; dutyTime5c: string;
  dutyTime6s: string; dutyTime6c: string;
  dutyTime7s: string; dutyTime7c: string;
  dutyTime8s: string; dutyTime8c: string;
};

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

export type NormalizedPharmacy = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  lat: number;
  lng: number;
  dutyTime: DutyTime;
};

// 공공API dutyTime1~7 = 월~일, dutyTime8 = 공휴일
function dayHoursOrNull(open: string, close: string): DayHours | null {
  if (!open || !close) return null;
  return { open, close };
}

export function normalizePharmacy(raw: RawPharmacyItem): NormalizedPharmacy {
  const lat = Number(raw.wgs84Lat);
  const lng = Number(raw.wgs84Lon);

  if (isNaN(lat)) {
    throw new Error(
      `Invalid latitude for pharmacy ${raw.hpid}: "${raw.wgs84Lat}" is not a valid number`
    );
  }

  if (isNaN(lng)) {
    throw new Error(
      `Invalid longitude for pharmacy ${raw.hpid}: "${raw.wgs84Lon}" is not a valid number`
    );
  }

  return {
    id: raw.hpid,
    name: raw.dutyName,
    address: raw.dutyAddr,
    phone: raw.dutyTel1 ? raw.dutyTel1 : null,
    lat,
    lng,
    dutyTime: {
      mon: dayHoursOrNull(raw.dutyTime1s, raw.dutyTime1c),
      tue: dayHoursOrNull(raw.dutyTime2s, raw.dutyTime2c),
      wed: dayHoursOrNull(raw.dutyTime3s, raw.dutyTime3c),
      thu: dayHoursOrNull(raw.dutyTime4s, raw.dutyTime4c),
      fri: dayHoursOrNull(raw.dutyTime5s, raw.dutyTime5c),
      sat: dayHoursOrNull(raw.dutyTime6s, raw.dutyTime6c),
      sun: dayHoursOrNull(raw.dutyTime7s, raw.dutyTime7c),
      holiday: dayHoursOrNull(raw.dutyTime8s, raw.dutyTime8c),
    },
  };
}
