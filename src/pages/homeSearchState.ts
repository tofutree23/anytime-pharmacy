import type { MapBounds } from '../hooks/usePharmaciesInBounds';

export type HomeSearchState = {
  regionPrefix: string | null;
  manualRegionOverride: boolean;
  bounds: MapBounds | null;
  mapRevision: number;
};

export const initialHomeSearchState: HomeSearchState = {
  regionPrefix: null,
  manualRegionOverride: false,
  bounds: null,
  mapRevision: 0,
};

export type HomeSearchAction =
  | { type: 'open-region-picker' }
  | { type: 'select-region'; regionPrefix: string }
  | { type: 'set-bounds'; bounds: MapBounds }
  | { type: 'return-to-current-location' };

export function homeSearchReducer(state: HomeSearchState, action: HomeSearchAction): HomeSearchState {
  switch (action.type) {
    case 'open-region-picker':
      return { ...state, regionPrefix: null, manualRegionOverride: true };
    case 'select-region':
      return { ...state, regionPrefix: action.regionPrefix, manualRegionOverride: false };
    case 'set-bounds':
      return { ...state, bounds: action.bounds };
    case 'return-to-current-location':
      return {
        regionPrefix: null,
        manualRegionOverride: false,
        bounds: null,
        mapRevision: state.mapRevision + 1,
      };
  }
}
