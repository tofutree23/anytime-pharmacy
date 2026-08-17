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

    // 네트워크 예외도 재시도 대상이 되도록 throw를 message로 변환한다.
    const runQuery = async (): Promise<{ rows: PharmacyRow[] | null; message: string | null }> => {
      try {
        return await runQueryOnce();
      } catch (err) {
        return {
          rows: null,
          message: err instanceof Error ? err.message : '알 수 없는 오류가 발생했어요.',
        };
      }
    };

    const runQueryOnce = async (): Promise<{ rows: PharmacyRow[] | null; message: string | null }> => {
      if (query.type === 'nearby') {
        const { data, error: rpcError } = await supabase.rpc('nearby_pharmacies', {
          target_lat: query.lat,
          target_lng: query.lng,
          max_distance_meters: 5000,
        });
        return { rows: (data ?? []) as PharmacyRow[], message: rpcError?.message ?? null };
      }
      const { data, error: queryError } = await supabase
        .from('pharmacies')
        .select('*')
        .ilike('address', `${query.regionPrefix}%`)
        .order('name', { ascending: true })
        .limit(REGION_QUERY_LIMIT);
      return { rows: (data ?? []) as PharmacyRow[], message: queryError?.message ?? null };
    };

    try {
      // 스펙상 실패 시 1회 자동 재시도한다. 두 번 모두 실패해야 에러 상태로 넘어가고,
      // 그 뒤에는 기존 "다시 시도" 버튼이 수동 재시도 수단으로 남는다.
      let result = await runQuery();
      if (result.message !== null) {
        if (requestIdRef.current !== requestId) return;
        result = await runQuery();
      }

      if (requestIdRef.current !== requestId) return;
      if (result.message !== null) {
        setError(result.message);
        setPharmacies([]);
      } else {
        setPharmacies((result.rows ?? []).map(toPharmacy));
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
