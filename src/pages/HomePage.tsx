import { useMemo, useState } from 'react';
import { List, Top, Paragraph } from '@toss/tds-mobile';
import { useLocation } from '../hooks/useLocation';
import { usePharmacies } from '../hooks/usePharmacies';
import { RegionPicker } from '../components/RegionPicker';
import { FilterBar, type FilterKey } from '../components/FilterBar';
import { PharmacyCard } from '../components/PharmacyCard';
import { ComplianceNotice } from '../components/ComplianceNotice';
import { isOpenNow, isNightHours, isHolidayOpen } from '../domain/businessHours';
import type { Pharmacy } from '../domain/types';

type HomePageProps = {
  onSelectPharmacy: (pharmacy: Pharmacy) => void;
};

export function HomePage({ onSelectPharmacy }: HomePageProps) {
  const { state: locationState } = useLocation();
  const [regionPrefix, setRegionPrefix] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<FilterKey[]>([]);

  const query =
    locationState.status === 'granted'
      ? { type: 'nearby' as const, lat: locationState.lat, lng: locationState.lng }
      : regionPrefix
        ? { type: 'region' as const, regionPrefix }
        : null;

  const { pharmacies, loading, error, refetch } = usePharmacies(
    query ?? { type: 'region', regionPrefix: '__none__' },
  );

  const toggleFilter = (key: FilterKey) => {
    setActiveFilters((prev) => (prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]));
  };

  const filteredPharmacies = useMemo(() => {
    const now = new Date();
    return pharmacies.filter((pharmacy) => {
      if (activeFilters.includes('openNow') && !isOpenNow(pharmacy.dutyTime, now)) return false;
      if (activeFilters.includes('night') && !isNightHours(pharmacy.dutyTime, now)) return false;
      if (activeFilters.includes('holiday') && !isHolidayOpen(pharmacy.dutyTime)) return false;
      return true;
    });
  }, [pharmacies, activeFilters]);

  if (locationState.status === 'loading') {
    return <Paragraph typography="st10">위치 정보를 확인하는 중이에요...</Paragraph>;
  }

  if (locationState.status === 'fallback' && !regionPrefix) {
    return <RegionPicker onSelect={setRegionPrefix} />;
  }

  return (
    <div>
      <Top title="언제나 약국" subtitleBottom="지금 문 연 약국을 찾아보세요." />
      <ComplianceNotice />
      <FilterBar active={activeFilters} onToggle={toggleFilter} />
      {loading && <Paragraph typography="st10">약국 정보를 불러오는 중이에요...</Paragraph>}
      {error && (
        <div>
          <Paragraph typography="st10">정보를 불러오지 못했어요.</Paragraph>
          <button type="button" onClick={refetch}>
            다시 시도
          </button>
        </div>
      )}
      {!loading && !error && filteredPharmacies.length === 0 && (
        <Paragraph typography="st10">주변에 등록된 약국이 없어요.</Paragraph>
      )}
      <List>
        {filteredPharmacies.map((pharmacy) => (
          <PharmacyCard key={pharmacy.id} pharmacy={pharmacy} onClick={onSelectPharmacy} />
        ))}
      </List>
    </div>
  );
}
