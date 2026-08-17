import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { toPharmacy, type PharmacyRow } from '../lib/pharmacyRow';

export type PharmacyQuery =
  | { type: 'nearby'; lat: number; lng: number }
  | { type: 'region'; regionPrefix: string };

// 지도와 목록이 서로 다른 데이터를 보고 있으면(예: 목록은 계속 더 불러오는데 지도는
// 일부만 반영) 지도에 핀이 갑자기 추가되거나, 목록에는 있는데 지도엔 안 보이는 등
// 둘이 어긋나 보인다. 그래서 페이지네이션 없이 한 번에 다 가져오고, 렌더링 성능은
// 목록 쪽 가상 스크롤(useVirtualizer)이 담당한다 — 지도 마커 개수만 방어적으로
// MAX_MARKERS(PharmacyMap.tsx)로 상한을 둔다.
const FETCH_LIMIT = 500;

async function fetchAll(query: PharmacyQuery): Promise<PharmacyRow[]> {
  if (query.type === 'nearby') {
    const { data, error } = await supabase.rpc('nearby_pharmacies', {
      target_lat: query.lat,
      target_lng: query.lng,
      max_distance_meters: 5000,
      page_offset: 0,
      page_size: FETCH_LIMIT,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as PharmacyRow[];
  }

  const { data, error } = await supabase
    .from('pharmacies')
    .select('*')
    .ilike('address', `${query.regionPrefix}%`)
    .order('name', { ascending: true })
    .range(0, FETCH_LIMIT - 1);
  if (error) throw new Error(error.message);
  return (data ?? []) as PharmacyRow[];
}

export function usePharmacies(query: PharmacyQuery) {
  const queryKey =
    query.type === 'nearby'
      ? (['pharmacies', 'nearby', query.lat, query.lng] as const)
      : (['pharmacies', 'region', query.regionPrefix] as const);

  const result = useQuery({
    queryKey,
    queryFn: () => fetchAll(query),
    staleTime: 5 * 60 * 1000,
  });

  return {
    pharmacies: (result.data ?? []).map(toPharmacy),
    loading: result.isLoading,
    error: result.error?.message ?? null,
    refetch: result.refetch,
  };
}
