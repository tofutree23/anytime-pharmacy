import { describe, expect, it } from 'vitest';
import { homeSearchReducer, type HomeSearchState } from './homeSearchState';

describe('homeSearchReducer', () => {
  it.each([
    {
      name: '선택한 지역',
      state: {
        regionPrefix: '부산광역시',
        manualRegionOverride: false,
        bounds: null,
        mapRevision: 2,
      },
    },
    {
      name: '패닝한 지도 범위',
      state: {
        regionPrefix: null,
        manualRegionOverride: false,
        bounds: { swLat: 35.1, swLng: 128.9, neLat: 35.3, neLng: 129.2 },
        mapRevision: 2,
      },
    },
  ] satisfies Array<{ name: string; state: HomeSearchState }>)('$name 상태에서 내 위치 기준으로 초기화한다', ({ state }) => {
    expect(homeSearchReducer(state, { type: 'return-to-current-location' })).toEqual({
      regionPrefix: null,
      manualRegionOverride: false,
      bounds: null,
      mapRevision: 3,
    });
  });
});
