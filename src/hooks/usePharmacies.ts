import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import type { Pharmacy } from '../domain/types';

type PharmacyRow = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  lat: number;
  lng: number;
  duty_time: Pharmacy['dutyTime'];
  source: string;
  updated_at: string;
  // nearby_pharmacies RPC에서만 내려온다. 지역 조회에는 기준점이 없어 없는 게 정상.
  distance_meters?: number | null;
};

function toPharmacy(row: PharmacyRow): Pharmacy {
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

export type PharmacyQuery =
  | { type: 'nearby'; lat: number; lng: number }
  | { type: 'region'; regionPrefix: string };

// 무한스크롤 한 페이지당 개수. 필터(지금영업중/심야/공휴일)는 클라이언트에서 이 페이지들을
// 누적한 결과 위에 적용한다 — 필터링된 개수가 적어 화면이 금방 바닥나면, 그만큼 다음
// 페이지를 더 당겨오면 되므로 서버 쿼리 자체는 필터를 몰라도 된다.
const PAGE_SIZE = 20;

async function fetchPage(query: PharmacyQuery, pageParam: number): Promise<PharmacyRow[]> {
  if (query.type === 'nearby') {
    const { data, error } = await supabase.rpc('nearby_pharmacies', {
      target_lat: query.lat,
      target_lng: query.lng,
      max_distance_meters: 5000,
      page_offset: pageParam,
      page_size: PAGE_SIZE,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as PharmacyRow[];
  }

  const { data, error } = await supabase
    .from('pharmacies')
    .select('*')
    .ilike('address', `${query.regionPrefix}%`)
    .order('name', { ascending: true })
    .range(pageParam, pageParam + PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  return (data ?? []) as PharmacyRow[];
}

export function useInfinitePharmacies(query: PharmacyQuery) {
  const queryKey =
    query.type === 'nearby'
      ? (['pharmacies', 'nearby', query.lat, query.lng] as const)
      : (['pharmacies', 'region', query.regionPrefix] as const);

  const result = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(query, pageParam),
    initialPageParam: 0,
    // 마지막 페이지가 PAGE_SIZE보다 적게 왔다면 더 가져올 게 없다는 뜻이다.
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
    // 지역 목록이 아주 많이 바뀌는 데이터는 아니라 5분 정도는 재요청 없이 캐시를 신뢰한다.
    staleTime: 5 * 60 * 1000,
  });

  const pharmacies = (result.data?.pages.flat() ?? []).map(toPharmacy);

  return {
    pharmacies,
    loading: result.isLoading,
    error: result.error?.message ?? null,
    refetch: result.refetch,
    fetchNextPage: result.fetchNextPage,
    hasNextPage: result.hasNextPage,
    isFetchingNextPage: result.isFetchingNextPage,
  };
}
