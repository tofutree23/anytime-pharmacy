import { useQuery } from '@tanstack/react-query';
import type { PlaceKind } from '../domain/types';
import { PLACE_SOURCES, placeQueryKeys, rowsToPlaces } from '../lib/placeSources';
import { supabase } from '../lib/supabaseClient';

export type PharmacyQuery = { type: 'region'; regionPrefix: string };

// GPS(내 주변) 모드는 usePharmaciesInBounds로 옮겨갔다 — 지도가 실제로 보여주는
// 범위만 가져와 목록과 공유한다. 이 훅은 지역 선택 모드 전용이다: 지역명에는
// 좌표가 없어 지도 범위 기반 재검색을 적용할 기준점이 없으므로, 선택한 지역
// 전체를 한 번에 가져온다.
const FETCH_LIMIT = 500;

async function fetchAll(kind: PlaceKind, query: PharmacyQuery): Promise<unknown[]> {
  const { data, error } = await supabase
    .from(PLACE_SOURCES[kind].table)
    .select('*')
    .ilike('address', `${query.regionPrefix}%`)
    .order('name', { ascending: true })
    .range(0, FETCH_LIMIT - 1);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export function usePharmacies(kind: PlaceKind, query: PharmacyQuery) {
  const queryKey = placeQueryKeys.region(kind, query.regionPrefix);

  const result = useQuery({
    queryKey,
    queryFn: () => fetchAll(kind, query),
    staleTime: 5 * 60 * 1000,
  });

  return {
    pharmacies: rowsToPlaces(kind, result.data ?? []),
    loading: result.isLoading,
    error: result.error?.message ?? null,
    refetch: result.refetch,
  };
}
