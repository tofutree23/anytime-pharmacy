import type { Place, PlaceKind } from '../domain/types';
import type { MapBounds } from '../hooks/usePharmaciesInBounds';
import { toAnimalPharmacy, type AnimalPharmacyRow } from './animalPharmacyRow';
import { toPharmacy, type PharmacyRow } from './pharmacyRow';

type RowOf = { pharmacy: PharmacyRow; animal: AnimalPharmacyRow };

// kind별 (테이블, 변환기) 짝을 타입으로 고정한다. 짝이 틀리면 컴파일 에러가 난다.
export const PLACE_SOURCES: {
  [K in PlaceKind]: {
    table: 'pharmacies' | 'animal_pharmacies';
    toPlace: (row: RowOf[K]) => Extract<Place, { kind: K }>;
  };
} = {
  pharmacy: { table: 'pharmacies', toPlace: toPharmacy },
  animal: { table: 'animal_pharmacies', toPlace: toAnimalPharmacy },
};

export function rowsToPlaces<K extends PlaceKind>(kind: K, rows: unknown[]): Extract<Place, { kind: K }>[] {
  const toPlace = PLACE_SOURCES[kind].toPlace as (row: unknown) => Extract<Place, { kind: K }>;
  return rows.map(toPlace);
}

export const placeQueryKeys = {
  region: (kind: PlaceKind, regionPrefix: string) => [kind, 'region', regionPrefix] as const,
  bounds: (kind: PlaceKind, bounds: MapBounds | null) =>
    bounds
      ? ([kind, 'bounds', bounds.swLat, bounds.swLng, bounds.neLat, bounds.neLng] as const)
      : ([kind, 'bounds', null] as const),
};
