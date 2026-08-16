import { useCallback, useEffect, useState } from 'react';
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

export type PharmacyQuery =
  | { type: 'nearby'; lat: number; lng: number }
  | { type: 'region'; regionPrefix: string };

export function usePharmacies(query: PharmacyQuery) {
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPharmacies = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (query.type === 'nearby') {
      const { data, error: rpcError } = await supabase.rpc('nearby_pharmacies', {
        target_lat: query.lat,
        target_lng: query.lng,
        max_distance_meters: 5000,
      });
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
        .order('name', { ascending: true });
      if (queryError) {
        setError(queryError.message);
        setPharmacies([]);
      } else {
        setPharmacies(((data ?? []) as PharmacyRow[]).map(toPharmacy));
      }
    }

    setLoading(false);
  }, [query.type, query.type === 'nearby' ? query.lat : query.regionPrefix, query.type === 'nearby' ? query.lng : null]);

  useEffect(() => {
    fetchPharmacies();
  }, [fetchPharmacies]);

  return { pharmacies, loading, error, refetch: fetchPharmacies };
}
