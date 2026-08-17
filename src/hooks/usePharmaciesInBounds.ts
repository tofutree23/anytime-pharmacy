import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { toPharmacy, type PharmacyRow } from '../lib/pharmacyRow';

export type MapBounds = {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
};

// 지도와 목록은 항상 이 훅 하나의 결과만 공유한다 — 둘이 서로 다른 쿼리를 보고 있으면
// (예: 목록은 GPS 반경, 지도는 다른 범위) 한쪽에만 보이는 항목이 생긴다. bounds는
// "이 지역 재검색" 버튼을 눌렀을 때만 갱신되고(지도를 살짝 움직일 때마다 자동으로
// 재조회하지 않음), 그래야 DB 쿼리 횟수도 사용자가 통제할 수 있다.
const MAX_BOUNDS_RESULTS = 300;

export function usePharmaciesInBounds(bounds: MapBounds | null) {
  const result = useQuery({
    queryKey: bounds
      ? (['pharmacies', 'bounds', bounds.swLat, bounds.swLng, bounds.neLat, bounds.neLng] as const)
      : (['pharmacies', 'bounds', null] as const),
    queryFn: async () => {
      if (!bounds) return [];
      const { data, error } = await supabase
        .from('pharmacies')
        .select('*')
        .gte('lat', bounds.swLat)
        .lte('lat', bounds.neLat)
        .gte('lng', bounds.swLng)
        .lte('lng', bounds.neLng)
        .limit(MAX_BOUNDS_RESULTS);
      if (error) throw new Error(error.message);
      return (data ?? []) as PharmacyRow[];
    },
    enabled: bounds !== null,
    staleTime: 60 * 1000,
  });

  return {
    pharmacies: (result.data ?? []).map(toPharmacy),
    loading: result.isLoading,
    error: result.error?.message ?? null,
    refetch: result.refetch,
  };
}
