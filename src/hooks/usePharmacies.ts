import { useCallback, useEffect, useRef, useState } from 'react';
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
  };
}

// 지역 조회는 서울/경기처럼 수천 건이 나오는 지역이 있어 상한을 둔다.
// 목록(가상화 없음)과 지도 마커가 모두 행 수에 비례해 무거워지므로 렌더 성능을 위한 상한이다.
export const REGION_QUERY_LIMIT = 200;

export type PharmacyQuery =
  | { type: 'nearby'; lat: number; lng: number }
  | { type: 'region'; regionPrefix: string };

export function usePharmacies(query: PharmacyQuery) {
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const fetchPharmacies = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      if (query.type === 'nearby') {
        const { data, error: rpcError } = await supabase.rpc('nearby_pharmacies', {
          target_lat: query.lat,
          target_lng: query.lng,
          max_distance_meters: 5000,
        });
        if (requestIdRef.current !== requestId) return;
        if (rpcError) {
          setError(rpcError.message);
          setPharmacies([]);
        } else {
          setPharmacies(((data ?? []) as PharmacyRow[]).map(toPharmacy));
        }
      } else {
        const { data, error: queryError } = await supabase
          .from('pharmacies')
          .select('*')
          .ilike('address', `${query.regionPrefix}%`)
          .order('name', { ascending: true })
          .limit(REGION_QUERY_LIMIT);
        if (requestIdRef.current !== requestId) return;
        if (queryError) {
          setError(queryError.message);
          setPharmacies([]);
        } else {
          setPharmacies(((data ?? []) as PharmacyRow[]).map(toPharmacy));
        }
      }
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했어요.');
      setPharmacies([]);
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [query.type, query.type === 'nearby' ? query.lat : query.regionPrefix, query.type === 'nearby' ? query.lng : null]);

  useEffect(() => {
    fetchPharmacies();
  }, [fetchPharmacies]);

  return { pharmacies, loading, error, refetch: fetchPharmacies };
}
