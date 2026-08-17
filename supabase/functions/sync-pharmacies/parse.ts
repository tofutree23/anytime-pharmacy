export type RawPharmacyItem = {
  hpid: string;
  dutyName: string;
  dutyAddr: string;
  dutyTel1: string;
  wgs84Lon: string;
  wgs84Lat: string;
  dutyTime1s: string | number; dutyTime1c: string | number;
  dutyTime2s: string | number; dutyTime2c: string | number;
  dutyTime3s: string | number; dutyTime3c: string | number;
  dutyTime4s: string | number; dutyTime4c: string | number;
  dutyTime5s: string | number; dutyTime5c: string | number;
  dutyTime6s: string | number; dutyTime6c: string | number;
  dutyTime7s: string | number; dutyTime7c: string | number;
  dutyTime8s: string | number; dutyTime8c: string | number;
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
// 주의: 공공API는 JSON 응답에서 leading zero가 없는 숫자는 number 타입으로 반환함
// 예: 1000 (number), "0900" (string, leading zero 때문에)
// 이 함수는 두 타입을 모두 처리하고 zero-padded 4-digit string으로 정규화함
function dayHoursOrNull(open: string | number, close: string | number): DayHours | null {
  if (!open || !close) return null;

  // 숫자나 문자열을 zero-padded 4-digit 문자열로 변환
  const openStr = typeof open === "number" ? String(open).padStart(4, "0") : open;
  const closeStr = typeof close === "number" ? String(close).padStart(4, "0") : close;

  return { open: openStr, close: closeStr };
}

// 대한민국(제주 포함) 전역을 넉넉히 감싸는 좌표 범위.
// Number("")가 NaN이 아니라 0이므로 isNaN 검사만으로는 빈 좌표가 통과해
// (0, 0) 기니만 앞바다에 약국이 저장되는 문제가 있었다.
const KOREA_LAT_RANGE = { min: 33, max: 39 };
const KOREA_LNG_RANGE = { min: 124, max: 132 };

export function normalizePharmacy(raw: RawPharmacyItem): NormalizedPharmacy {
  const lat = Number(raw.wgs84Lat);
  const lng = Number(raw.wgs84Lon);

  if (isNaN(lat) || lat < KOREA_LAT_RANGE.min || lat > KOREA_LAT_RANGE.max) {
    throw new Error(
      `Invalid latitude for pharmacy ${raw.hpid}: "${raw.wgs84Lat}" is not a valid Korean latitude`
    );
  }

  if (isNaN(lng) || lng < KOREA_LNG_RANGE.min || lng > KOREA_LNG_RANGE.max) {
    throw new Error(
      `Invalid longitude for pharmacy ${raw.hpid}: "${raw.wgs84Lon}" is not a valid Korean longitude`
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
