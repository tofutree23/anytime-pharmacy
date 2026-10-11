import type { AnimalPharmacy } from '../domain/types';

export type AnimalPharmacyRow = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  lat: number;
  lng: number;
  source: string;
  updated_at: string;
  distance_meters?: number | null;
  licensed_at: string | null;
};

export function toAnimalPharmacy(row: AnimalPharmacyRow): AnimalPharmacy {
  return {
    kind: 'animal',
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    lat: row.lat,
    lng: row.lng,
    source: row.source,
    updatedAt: row.updated_at,
    distanceMeters: row.distance_meters ?? null,
  };
}
