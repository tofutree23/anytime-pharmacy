import { useMemo, useState } from 'react';
import { Top, Paragraph, ChipItem, ChipItemRightIcon, List } from '@toss/tds-mobile';
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
  // GPS 권한이 허용된 상태에서도 사용자가 헤더의 위치 필을 눌러 "지역 직접 선택" 흐름으로
  // 강제 진입할 수 있게 하는 플래그. 이게 없으면 GPS가 granted인 동안은 regionPrefix를
  // null로 되돌려도 query가 즉시 nearby로 재계산되어 RegionPicker가 전혀 보이지 않는다.
  const [manualRegionOverride, setManualRegionOverride] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterKey[]>([]);

  // regionPrefix가 있으면(사용자가 명시적으로 지역을 골랐다면) GPS가 granted이더라도
  // 지역 검색을 우선한다. GPS 우선순위는 regionPrefix가 비어 있을 때만 적용된다.
  const query = regionPrefix
    ? { type: 'region' as const, regionPrefix }
    : locationState.status === 'granted'
      ? { type: 'nearby' as const, lat: locationState.lat, lng: locationState.lng }
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

  // 헤더의 위치 필을 눌렀을 때 실행된다. regionPrefix를 비우고 manualRegionOverride를
  // 켜서 GPS가 granted 상태로 남아 있더라도 RegionPicker로 강제 진입시킨다.
  // (GPS 재요청도 함께 트리거하지만, override 플래그가 켜져 있는 한 GPS 결과와 무관하게
  // RegionPicker가 유지되며, 사용자가 실제로 지역을 고르면 override는 해제된다.)
  const changeRegion = () => {
    setRegionPrefix(null);
    setManualRegionOverride(true);
    requestAgain();
  };

  const selectRegion = (region: string) => {
    setRegionPrefix(region);
    setManualRegionOverride(false);
  };

  if (locationState.status === 'loading') {
    return <Paragraph typography="st10">위치 정보를 확인하는 중이에요...</Paragraph>;
  }

  if (!regionPrefix && (locationState.status === 'fallback' || manualRegionOverride)) {
    return <RegionPicker onSelect={selectRegion} />;
  }

  return (
    <div style={{ background: '#F5F6F8', minHeight: '100%' }}>
      <Top
        title="언제나 약국"
        subtitleBottom="지금 문 연 약국을 찾아보세요."
        // 헤더 우측에는 항상 현재 위치/지역을 보여주는 필/칩을 둔다. 지역 모드에서는
        // 선택된 지역명을, GPS 모드에서는 역지오코딩 없이 일반화된 라벨을 보여준다.
        // 클릭하면 (모드와 무관하게) 지역을 직접 고를 수 있게 한다.
        right={
          <ChipItem onClick={changeRegion} right={<ChipItemRightIcon iconType="dropdown" />}>
            {isRegionMode ? regionPrefix : '내 위치 근처'}
          </ChipItem>
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
      {/* 참조 디자인은 구분선이 있는 그룹 리스트가 아니라 gap 12px로 떠 있는 카드들이다.
          TDS List(ul)를 사용하되 기본 목록 스타일(margin/padding/list-style)을 리셋하고
          flex column + gap으로 카드 사이 여백을 준다. 각 카드의 구분선 제거는
          PharmacyCard 내부 ListRow의 border="none"이 담당한다. */}
      <List
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: '4px 16px 16px',
          margin: 0,
          listStyle: 'none',
        }}
      >
        {filteredPharmacies.map((pharmacy) => (
          <PharmacyCard key={pharmacy.id} pharmacy={pharmacy} onClick={onSelectPharmacy} />
        ))}
      </List>
      <BannerAd />
    </div>
  );
}
