import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnimalPharmacyCard } from './AnimalPharmacyCard';
import type { AnimalPharmacy } from '../domain/types';

const pharmacy: AnimalPharmacy = {
  kind: 'animal',
  id: 'A1',
  name: '행복동물약국',
  address: '서울특별시 중구 세종대로 110',
  phone: '02-123-4567',
  lat: 37.5663,
  lng: 126.978,
  source: '행정안전부 동물약국 인허가 정보',
  updatedAt: '2026-10-11T08:47:19.197Z',
  distanceMeters: 320,
};

describe('AnimalPharmacyCard', () => {
  it('전화번호가 있으면 카드에 표시한다', () => {
    const html = renderToStaticMarkup(
      <AnimalPharmacyCard pharmacy={pharmacy} onClick={() => undefined} />,
    );

    expect(html).toContain('02-123-4567');
  });
});
