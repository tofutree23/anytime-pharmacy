import type { FilterKey } from '../components/FilterBar';
import type { Pharmacy } from './types';
import { isOpenNow, isNightHours, is24Hours, isHolidayOpen } from './businessHours';

// 지역 선택 모드(전체 목록)와 GPS 모드(지도 범위 검색)가 서로 다른 소스에서
// 약국 배열을 받아오지만, 활성화된 필터는 항상 동일한 기준으로 적용돼야
// 하므로 판정 로직을 한 곳에 둔다.
export function matchesActiveFilters(pharmacy: Pharmacy, activeFilters: FilterKey[], now: Date): boolean {
  if (activeFilters.includes('openNow') && !isOpenNow(pharmacy.dutyTime, now)) return false;
  if (activeFilters.includes('night') && !isNightHours(pharmacy.dutyTime, now)) return false;
  if (activeFilters.includes('allDay') && !is24Hours(pharmacy.dutyTime, now)) return false;
  if (activeFilters.includes('holiday') && !isHolidayOpen(pharmacy.dutyTime)) return false;
  return true;
}
