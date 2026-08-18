import { lazy, Suspense, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Top, Paragraph, ChipItem, ChipItemRightIcon, List } from '@toss/tds-mobile';
import { useLocation } from '../hooks/useLocation';
import { usePharmacies } from '../hooks/usePharmacies';
import { usePharmaciesInBounds, type MapBounds } from '../hooks/usePharmaciesInBounds';
import { FilterBar, type FilterKey } from '../components/FilterBar';
import { PharmacyCard } from '../components/PharmacyCard';
import { PharmacyMap } from '../components/PharmacyMap';
import { ComplianceNotice } from '../components/ComplianceNotice';
import { BannerAd } from '../components/BannerAd';
import { matchesActiveFilters } from '../domain/filterPharmacies';
import type { Pharmacy } from '../domain/types';
import { homeSearchReducer, initialHomeSearchState } from './homeSearchState';

// 위치 권한이 없거나 GPS 요청이 실패한 사용자만 보는 화면이라(대다수는 지도/목록
// 화면으로 바로 감), 초기 청크에서 빼서 필요할 때만 불러온다.
const RegionPicker = lazy(() => import('../components/RegionPicker').then((m) => ({ default: m.RegionPicker })));

type HomePageProps = {
  onSelectPharmacy: (pharmacy: Pharmacy) => void;
};

export function HomePage({ onSelectPharmacy }: HomePageProps) {
  const { state: locationState, requestAgain: requestLocationAgain } = useLocation();
  const [searchState, dispatchSearch] = useReducer(homeSearchReducer, initialHomeSearchState);
  const { regionPrefix, manualRegionOverride, bounds, mapRevision } = searchState;
  // GPS 권한이 허용된 상태에서도 사용자가 헤더의 위치 필을 눌러 "지역 직접 선택" 흐름으로
  // 강제 진입할 수 있게 하는 플래그. 이게 없으면 GPS가 granted인 동안은 regionPrefix를
  // null로 되돌려도 query가 즉시 nearby로 재계산되어 RegionPicker가 전혀 보이지 않는다.
  const [activeFilters, setActiveFilters] = useState<FilterKey[]>([]);

  // regionPrefix가 있으면(사용자가 명시적으로 지역을 골랐다면) GPS가 granted이더라도
  // 지역 검색을 우선한다. GPS 우선순위는 regionPrefix가 비어 있을 때만 적용된다.
  const query = regionPrefix
    ? { type: 'region' as const, regionPrefix }
    : locationState.status === 'granted'
      ? { type: 'nearby' as const, lat: locationState.lat, lng: locationState.lng }
      : null;

  const isRegionMode = query?.type === 'region';

  // 지역 모드: 선택한 지역명으로 한 번에 다 불러온다(지역명에는 좌표가 없어 지도
  // 범위 기반 재검색을 적용할 기준점이 없다). GPS(내 주변) 모드: 지도가 실제로
  // 보여주는 범위에 있는 약국만, "이 지역 재검색" 버튼(최초 1회는 자동)으로
  // 가져온다 — 지도를 조금만 움직여도 핀이 계속 늘어나는 문제를 막기 위함.
  const regionResult = usePharmacies(query?.type === 'region' ? query : { type: 'region', regionPrefix: '__none__' });
  const boundsResult = usePharmaciesInBounds(bounds);
  const { pharmacies, loading, error, refetch } = isRegionMode ? regionResult : boundsResult;

  const toggleFilter = (key: FilterKey) => {
    setActiveFilters((prev) => (prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]));
  };

  // 목록과 지도가 항상 정확히 같은 배열을 보도록, 필터링을 이 한 곳에서만 하고
  // 그 결과(filteredPharmacies)를 목록·지도 양쪽에 그대로 내려준다.
  const filteredPharmacies = useMemo(() => {
    const now = new Date();
    return pharmacies.filter((pharmacy) => matchesActiveFilters(pharmacy, activeFilters, now));
  }, [pharmacies, activeFilters]);

  // 지도는 화면에 고정하고, 약국 카드 목록만 자체 스크롤 컨테이너 안에서 스크롤되도록
  // 한다. 목록은 한 번에 다 불러온 filteredPharmacies 전체에 대해 화면에 보이는
  // 범위만 실제로 렌더링한다(무한스크롤로 데이터를 더 당겨오는 것이 아니라, 이미
  // 가진 데이터 중 보여줄 것만 가상화). 카드 높이가 주소 줄바꿈 등으로 조금씩
  // 달라질 수 있어 estimateSize는 대략값만 주고, 각 아이템에 measureElement ref를
  // 달아 실제 렌더된 높이로 보정한다.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredPharmacies.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 92,
    overscan: 6,
  });

  useEffect(() => {
    if (!scrollContainerRef.current) return;
    scrollContainerRef.current.scrollTop = 0;
  }, [activeFilters]);

  // 목록이 비어 있을 때의 안내 문구. 원인(필터 vs 지역/범위 자체에 데이터 없음)에 따라
  // 다른 문구를 보여줘야 사용자가 다음에 뭘 해야 할지 알 수 있다.
  const emptyStateMessage =
    activeFilters.length > 0 ? '선택한 조건에 맞는 약국이 없어요.' : '이 지역에 등록된 약국이 없어요.';
  const emptyStateHint =
    activeFilters.length > 0
      ? '필터를 조정해보세요.'
      : isRegionMode
        ? '다른 지역을 선택해보세요.'
        : '지도를 이동한 뒤 "이 지역 재검색"을 눌러보세요.';

  // 헤더의 위치 필을 눌렀을 때 실행된다. regionPrefix를 비우고 manualRegionOverride를
  // 켜서 GPS가 granted 상태로 남아 있더라도 RegionPicker로 강제 진입시킨다.
  // GPS를 다시 요청하지는 않는다 — requestAgain()을 호출하면 locationState가 잠깐
  // 'loading'으로 바뀌어 RegionPicker 대신 로딩 화면이 먼저 뜨고, GPS 응답이 느리거나
  // 멈추면 그 상태에 갇힐 수 있다. 사용자가 실제로 지역을 고르면 override는 해제된다.
  const changeRegion = () => {
    dispatchSearch({ type: 'open-region-picker' });
  };

  const selectRegion = (region: string) => {
    dispatchSearch({ type: 'select-region', regionPrefix: region });
  };

  const returnToCurrentLocation = () => {
    if (locationState.status !== 'granted') return;
    dispatchSearch({ type: 'return-to-current-location' });
  };

  if (locationState.status === 'loading') {
    return <Paragraph typography="st10">위치 정보를 확인하는 중이에요...</Paragraph>;
  }

  if (!regionPrefix && (locationState.status === 'fallback' || locationState.status === 'blocked' || manualRegionOverride)) {
    // granted 상태(헤더 필로 진입)면 이미 있는 좌표로 그냥 돌아가면 되고, fallback 상태
    // (거부/타임아웃)면 requestLocationAgain이 앱인토스 재요청 다이얼로그를 다시 띄운다.
    // blocked 상태(OS 설정 자체에서 막힘)는 앱 안에서 재요청할 방법이 없으므로 버튼
    // 자체를 없애고 RegionPicker가 설정 안내 문구를 보여주게 한다.
    const onUseCurrentLocation =
      locationState.status === 'granted'
        ? returnToCurrentLocation
        : locationState.status === 'blocked'
          ? undefined
          : requestLocationAgain;
    return (
      <Suspense fallback={null}>
        <RegionPicker
          onSelect={selectRegion}
          onUseCurrentLocation={onUseCurrentLocation}
          locationBlocked={locationState.status === 'blocked'}
        />
      </Suspense>
    );
  }

  return (
    <div
      style={{
        background: '#F5F6F8',
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* 상단 고정 영역: 헤더/고지문구/필터/지도. 여기는 스크롤되지 않는다. */}
      <div style={{ flexShrink: 0 }}>
        {/* Top/PharmacyMap은 자체 좌우 여백이 없는 컴포넌트라, 다른 요소들(ComplianceNotice,
            FilterBar, List)이 이미 쓰고 있는 16px 좌우 패딩을 여기서도 명시적으로 감싸준다.
            그렇지 않으면 화면 양 끝까지 붙어버린다. */}
        <div style={{ padding: '0 16px' }}>
          <Top
            // Top의 title/subtitleBottom은 문자열을 그대로 넘기면 TDS 기본값(둘 다 16px/regular)이
            // 적용돼 제목과 부제목의 크기 구분이 사라진다. 실제 렌더링된 CSS 변수(--tds-t-*-text-fontSize)를
            // 확인해 t4=20px, st11=14px로 명시적인 위계를 준다.
            title={
              <Paragraph typography="t4" fontWeight="bold">
                언제나 약국
              </Paragraph>
            }
            subtitleBottom={
              <Paragraph typography="st11" color="#4E5968">
                지금 문 연 약국을 찾아보세요.
              </Paragraph>
            }
            // 헤더 우측에는 항상 현재 위치/지역을 보여주는 필/칩을 둔다. 지역 모드에서는
            // 선택된 지역명을, GPS 모드에서는 역지오코딩 없이 일반화된 라벨을 보여준다.
            // 클릭하면 (모드와 무관하게) 지역을 직접 고를 수 있게 한다.
            right={
              <ChipItem onClick={changeRegion} right={<ChipItemRightIcon iconType="dropdown" />}>
                {isRegionMode ? regionPrefix : '내 위치 근처'}
              </ChipItem>
            }
          />
        </div>
        <ComplianceNotice />
        <FilterBar active={activeFilters} onToggle={toggleFilter} />
        <div style={{ padding: '0 16px', marginTop: 12, marginBottom: 16 }}>
          {/* 지도와 목록이 완전히 같은 filteredPharmacies를 받는다 — 목록에만 있고
              지도엔 안 보이는 항목이 생기지 않는다. 마커 개수 상한은 PharmacyMap
              내부의 MAX_MARKERS가 방어적으로 처리한다. */}
          <PharmacyMap
            key={mapRevision}
            pharmacies={filteredPharmacies}
            center={locationState.status === 'granted' ? { lat: locationState.lat, lng: locationState.lng } : null}
            // 지역을 선택하면 그 지역 약국 목록의 첫 번째 좌표로 지도를 이동시킨다(정렬
            // 기준 없이 여러 개면 배열 첫 요소로). 필터로 걸러진(filteredPharmacies) 값을
            // 써서, 화면에 보이는 첫 약국으로 이동시킨다.
            focusCenter={isRegionMode && filteredPharmacies[0] ? { lat: filteredPharmacies[0].lat, lng: filteredPharmacies[0].lng } : null}
            onSelectPharmacy={onSelectPharmacy}
            // 지역 모드에서는 지도 범위 재검색을 적용하지 않는다(좌표 기준점이 없음) —
            // null을 넘기면 PharmacyMap이 idle 추적 자체를 하지 않아 버튼도 뜨지 않고,
            // 배경에서 불필요한 bounds 쿼리도 발생시키지 않는다.
            onSearchThisArea={
              isRegionMode ? null : (nextBounds: MapBounds) => dispatchSearch({ type: 'set-bounds', bounds: nextBounds })
            }
            onReturnToCurrentLocation={locationState.status === 'granted' ? returnToCurrentLocation : null}
          />
        </div>
      </div>

      {/* 약국 목록만 담당하는 스크롤 컨테이너. flex:1로 지도 아래 남은 공간을 모두 차지하고,
          그 안에서만 스크롤된다(지도는 항상 같은 자리에 고정). */}
      <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: '48px 16px', textAlign: 'center' }}>
            <Paragraph typography="st10" color="#8B95A1">
              약국 정보를 불러오는 중이에요...
            </Paragraph>
          </div>
        )}
        {!loading && error && (
          <div style={{ padding: '48px 16px', textAlign: 'center' }}>
            <Paragraph typography="st10" color="#8B95A1">
              정보를 불러오지 못했어요.
            </Paragraph>
            <button type="button" onClick={() => refetch()} style={{ marginTop: 12 }}>
              다시 시도
            </button>
          </div>
        )}
        {/* 빈 상태는 지도 아래, 목록이 있었을 자리에 그대로 두고 충분한 여백을 준다 —
            필터/지도 사이에 끼워 두면(과거 배치) 눈에 잘 안 띄고 어색해 보였다. */}
        {!loading && !error && filteredPharmacies.length === 0 && (
          <div style={{ padding: '48px 16px', textAlign: 'center' }}>
            <Paragraph typography="st9" fontWeight="bold" color="#4E5968">
              {emptyStateMessage}
            </Paragraph>
            <Paragraph typography="st11" color="#8B95A1" style={{ marginTop: 4 }}>
              {emptyStateHint}
            </Paragraph>
          </div>
        )}
        {!loading && !error && filteredPharmacies.length > 0 && (
          <List
            style={{
              position: 'relative',
              height: rowVirtualizer.getTotalSize(),
              margin: 0,
              padding: 0,
              listStyle: 'none',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const pharmacy = filteredPharmacies[virtualItem.index];
              return (
                <div
                  key={pharmacy.id}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualItem.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 16,
                    right: 16,
                    transform: `translateY(${virtualItem.start}px)`,
                    paddingBottom: 12,
                  }}
                >
                  <PharmacyCard pharmacy={pharmacy} onClick={onSelectPharmacy} />
                </div>
              );
            })}
          </List>
        )}
        <BannerAd />
      </div>
    </div>
  );
}
