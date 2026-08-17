import type { Pharmacy } from '../domain/types';

// usePharmacies(지역 선택 모드)와 usePharmaciesInBounds(GPS/지도 범위 검색)가
// 공통으로 쓰는 Supabase 행 -> 도메인 타입 변환. 두 군데서 각자 구현하면
// 필드 매핑이 어긋날 위험이 있어 한 곳에 모은다.
export type PharmacyRow = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  lat: number;
  lng: number;
  duty_time: Pharmacy['dutyTime'];
  source: string;
  updated_at: string;
  // nearby_pharmacies RPC에서만 내려온다. 지역/범위 조회에는 기준점이 없어 없는 게 정상.
  distance_meters?: number | null;
};

export function toPharmacy(row: PharmacyRow): Pharmacy {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    lat: row.lat,
    lng: row.lng,
    dutyTime: row.duty_time,
    source: row.source,
    updatedAt: row.updated_at,
    distanceMeters: row.distance_meters ?? null,
  };
}
