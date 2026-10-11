import { describe, expect, it } from 'vitest';
import { PLACE_SOURCES, placeQueryKeys, rowsToPlaces } from './placeSources';
import { toPharmacy } from './pharmacyRow';
import type { PlaceKind } from '../domain/types';

const animalRow = {
  id: 'A1', name: '행복동물약국', address: '서울특별시 중구 세종대로 110', phone: null,
  lat: 37.56, lng: 126.97, licensed_at: '2019-03-02', source: '행정안전부 동물약국 인허가 정보',
  updated_at: '2026-09-30T00:00:00Z',
};

describe('PLACE_SOURCES', () => {
  it('kind별로 조회할 테이블이 정해져 있다', () => {
    expect(PLACE_SOURCES.pharmacy.table).toBe('pharmacies');
    expect(PLACE_SOURCES.animal.table).toBe('animal_pharmacies');
  });
});

describe('rowsToPlaces', () => {
  it('동물약국 행을 AnimalPharmacy로 바꾸고 dutyTime을 만들지 않는다', () => {
    const [place] = rowsToPlaces('animal', [animalRow]);
    expect(place).toEqual({
      kind: 'animal', id: 'A1', name: '행복동물약국', address: '서울특별시 중구 세종대로 110', phone: null,
      lat: 37.56, lng: 126.97, source: '행정안전부 동물약국 인허가 정보', updatedAt: '2026-09-30T00:00:00Z',
      distanceMeters: null,
    });
  });

  it('약국 행에는 kind pharmacy가 붙는다', () => {
    const row = { ...animalRow, duty_time: { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null, holiday: null } };
    expect(rowsToPlaces('pharmacy', [row])[0].kind).toBe('pharmacy');
  });
});

describe('placeQueryKeys', () => {
  const bounds = { swLat: 1, swLng: 2, neLat: 3, neLng: 4 };

  it('같은 입력이어도 kind가 다르면 키가 다르다', () => {
    expect(placeQueryKeys.region('pharmacy', '서울')).not.toEqual(placeQueryKeys.region('animal', '서울'));
    expect(placeQueryKeys.bounds('pharmacy', bounds)).not.toEqual(placeQueryKeys.bounds('animal', bounds));
    expect(placeQueryKeys.bounds('pharmacy', null)).not.toEqual(placeQueryKeys.bounds('animal', null));
  });

  it('키의 첫 원소는 kind다', () => {
    for (const kind of ['pharmacy', 'animal'] as PlaceKind[]) {
      expect(placeQueryKeys.region(kind, '서울')[0]).toBe(kind);
      expect(placeQueryKeys.bounds(kind, bounds)[0]).toBe(kind);
      expect(placeQueryKeys.bounds(kind, null)[0]).toBe(kind);
    }
  });

  it('기존 키 형태를 유지한다', () => {
    expect(placeQueryKeys.region('animal', '서울')).toEqual(['animal', 'region', '서울']);
    expect(placeQueryKeys.bounds('animal', bounds)).toEqual(['animal', 'bounds', 1, 2, 3, 4]);
    expect(placeQueryKeys.bounds('animal', null)).toEqual(['animal', 'bounds', null]);
  });
});

describe('PLACE_SOURCES 타입', () => {
  it('kind와 변환기 짝이 틀리면 컴파일 에러다', () => {
    // @ts-expect-error animal 자리에 toPharmacy를 넣을 수 없다
    const wrong: (typeof PLACE_SOURCES)['animal']['toPlace'] = toPharmacy;
    expect(wrong).toBe(toPharmacy);
  });
});
