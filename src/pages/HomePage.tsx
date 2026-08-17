import { useMemo, useState } from 'react';
import { Top, Paragraph, TextButton } from '@toss/tds-mobile';
import { useLocation } from '../hooks/useLocation';
import { usePharmacies, REGION_QUERY_LIMIT, NEARBY_QUERY_LIMIT } from '../hooks/usePharmacies';
import { RegionPicker } from '../components/RegionPicker';
import { FilterBar, type FilterKey } from '../components/FilterBar';
import { PharmacyCard } from '../components/PharmacyCard';
import { PharmacyMap } from '../components/PharmacyMap';
import { ComplianceNotice } from '../components/ComplianceNotice';
import { BannerAd } from '../components/BannerAd';
import { isOpenNow, isNightHours, isHolidayOpen } from '../domain/businessHours';
import type { Pharmacy } from '../domain/types';

type HomePageProps = {
  onSelectPharmacy: (pharmacy: Pharmacy) => void;
};

export function HomePage({ onSelectPharmacy }: HomePageProps) {
  const { state: locationState, requestAgain } = useLocation();
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

  // 지역/주변(GPS) 조회 모두 각자의 상한(REGION_QUERY_LIMIT / NEARBY_QUERY_LIMIT)까지만
  // 가져오므로, 상한에 걸린 경우 결과가 잘렸다는 사실을 사용자에게 알려준다.
  // nearby_pharmacies는 이미 거리순으로 정렬되어 오므로 상한을 적용해도 "가까운 순"은
  // 그대로 유지된다.
  const resultsTruncated =
    (query?.type === 'region' && pharmacies.length >= REGION_QUERY_LIMIT) ||
    (query?.type === 'nearby' && pharmacies.length >= NEARBY_QUERY_LIMIT);

  const isRegionMode = query?.type === 'region';

  // 지역 선택을 되돌린다. regionPrefix를 비우면 RegionPicker가 다시 나타나고,
  // 동시에 위치 권한도 한 번 더 요청해 GPS가 가능해졌다면 주변 검색으로 돌아간다.
  const changeRegion = () => {
    setRegionPrefix(null);
    requestAgain();
  };

  if (locationState.status === 'loading') {
    return <Paragraph typography="st10">위치 정보를 확인하는 중이에요...</Paragraph>;
  }

  if (locationState.status === 'fallback' && !regionPrefix) {
    return <RegionPicker onSelect={setRegionPrefix} />;
  }

  return (
    <div style={{ background: '#F5F6F8', minHeight: '100%' }}>
      <Top
        title="언제나 약국"
        subtitleBottom="지금 문 연 약국을 찾아보세요."
        // 지역 모드에서는 헤더 우측에 현재 지역을 보여주는 필/칩을 두고,
        // 클릭하면 지역을 다시 고를 수 있게 한다(위치 권한 재시도 포함).
        right={
          isRegionMode ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: '#fff',
                border: '1px solid #E5E8EB',
                borderRadius: 999,
                padding: '4px 6px 4px 12px',
              }}
            >
              <TextButton size="xsmall" variant="arrow" arrowPlacement="inline" onClick={changeRegion}>
                {regionPrefix}
              </TextButton>
            </div>
          ) : undefined
        }
      />
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
      {!loading && !error && resultsTruncated && (
        <Paragraph typography="st10">
          {isRegionMode
            ? '지역 내 약국이 많아 일부만 표시돼요. 필터를 사용해 좁혀보세요.'
            : '주변 약국이 많아 가까운 순으로 일부만 표시돼요. 필터를 사용해 좁혀보세요.'}
        </Paragraph>
      )}
      <PharmacyMap
        pharmacies={filteredPharmacies}
        center={locationState.status === 'granted' ? { lat: locationState.lat, lng: locationState.lng } : null}
        onSelectPharmacy={onSelectPharmacy}
      />
      {/* 참조 디자인은 구분선이 있는 그룹 리스트가 아니라 gap 12px로 떠 있는 카드들이라,
          TDS List 대신 카드 사이 여백을 주는 flex 컨테이너를 사용한다. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 16px 16px' }}>
        {filteredPharmacies.map((pharmacy) => (
          <PharmacyCard key={pharmacy.id} pharmacy={pharmacy} onClick={onSelectPharmacy} />
        ))}
      </div>
      <BannerAd />
    </div>
  );
}
