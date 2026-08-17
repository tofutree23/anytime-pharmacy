import { useCallback, useEffect, useRef, useState } from 'react';
import { useKakaoMap } from '../hooks/useKakaoMap';
import type { Pharmacy } from '../domain/types';
import type { MapBounds } from '../hooks/usePharmaciesInBounds';

type PharmacyMapProps = {
  pharmacies: Pharmacy[];
  center: { lat: number; lng: number } | null;
  onSelectPharmacy: (pharmacy: Pharmacy) => void;
  // 지도가 움직일 때마다 자동으로 재조회하지 않고, 사용자가 "이 지역 재검색"
  // 버튼을 눌렀을 때만(그리고 최초 1회는 자동으로) 호출된다. null이면(지역 선택
  // 모드처럼 좌표 기준점이 없는 경우) idle 추적 자체를 하지 않아 버튼도 뜨지 않는다.
  onSearchThisArea: ((bounds: MapBounds) => void) | null;
};

// 375px 폭 기준 참조 디자인은 지도 높이 220px(뷰포트의 약 25~30%)를 사용한다.
// 기존 45vh는 지도가 화면을 과도하게 차지해 리스트가 밀리는 문제가 있어,
// 리스트 중심 레이아웃에 맞게 고정 픽셀 값으로 낮춘다.
const MAP_HEIGHT = '240px';
// 마커는 한 개씩 동기적으로 생성되므로 행 수가 많으면 그대로 프리즈로 이어진다.
// 호출자가 상한 없는 배열을 넘기더라도 안전하도록 방어적으로 자른다.
const MAX_MARKERS = 200;

type KakaoLatLng = { getLat: () => number; getLng: () => number };
type KakaoBounds = { getSouthWest: () => KakaoLatLng; getNorthEast: () => KakaoLatLng };
type KakaoMap = { relayout: () => void; getBounds: () => KakaoBounds };
type KakaoMarker = { setMap: (map: unknown) => void };

function toMapBounds(bounds: KakaoBounds): MapBounds {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  return { swLat: sw.getLat(), swLng: sw.getLng(), neLat: ne.getLat(), neLng: ne.getLng() };
}

export function PharmacyMap({ pharmacies, center, onSelectPharmacy, onSearchThisArea }: PharmacyMapProps) {
  const { isLoaded, error: loadError } = useKakaoMap();
  const [initError, setInitError] = useState<string | null>(null);
  const [showSearchButton, setShowSearchButton] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const markersRef = useRef<KakaoMarker[]>([]);
  const pendingBoundsRef = useRef<MapBounds | null>(null);
  // 최초 idle에서는 버튼 없이 바로 한 번 검색을 실행해 초기 데이터를 채운다.
  // 이후부터는 지도를 움직여도 버튼을 눌러야만 재검색된다.
  const hasAutoSearchedRef = useRef(false);

  // 최초 지도 생성 시점의 중심 좌표로만 사용한다. 이후 center가 바뀌어도
  // 사용자가 이동/확대한 지도를 다시 중앙으로 되돌리지 않는다.
  const centerRef = useRef(center);
  const pharmaciesRef = useRef(pharmacies);
  const onSearchThisAreaRef = useRef(onSearchThisArea);

  // 렌더 중 ref를 쓰지 않도록, 최신 값 동기화는 지도 생성 effect보다 먼저 선언된
  // 이 effect에서 처리한다(선언 순서대로 실행된다).
  useEffect(() => {
    centerRef.current = center;
    pharmaciesRef.current = pharmacies;
    onSearchThisAreaRef.current = onSearchThisArea;
  }, [center, pharmacies, onSearchThisArea]);

  // 지도 인스턴스는 단 한 번만 만들고 ref에 보관한다. 필터 토글로 pharmacies가
  // 바뀔 때마다 재생성하면 사용자의 pan/zoom 상태가 초기화된다.
  const ensureMap = useCallback((): KakaoMap | null => {
    if (mapRef.current) return mapRef.current;
    if (!containerRef.current) return null;

    try {
      const kakao = window.kakao;
      const first = pharmaciesRef.current[0];
      const fallbackCenter = first
        ? { lat: first.lat, lng: first.lng }
        : { lat: 37.5665, lng: 126.978 }; // 서울시청 기본값
      const mapCenter = centerRef.current ?? fallbackCenter;

      const map = new kakao.maps.Map(containerRef.current, {
        center: new kakao.maps.LatLng(mapCenter.lat, mapCenter.lng),
        level: 5,
      }) as KakaoMap;

      mapRef.current = map;
      setInitError(null);

      // 지도가 움직임을 멈출 때마다(드래그/줌 종료) 호출된다. 최초 1회는 자동으로
      // onSearchThisArea를 실행해 초기 데이터를 채우고, 이후에는 버튼을 눌러야만
      // 재검색되도록 pendingBoundsRef에 보관만 해둔다(과도한 조회 방지).
      kakao.maps.event.addListener(map, 'idle', () => {
        if (!onSearchThisAreaRef.current) return;
        const bounds = toMapBounds(map.getBounds());
        if (!hasAutoSearchedRef.current) {
          hasAutoSearchedRef.current = true;
          onSearchThisAreaRef.current(bounds);
          return;
        }
        pendingBoundsRef.current = bounds;
        setShowSearchButton(true);
      });

      // initError에서 복구되는 경우, 이 시점의 컨테이너는 아직 이전 렌더(height: 0)의
      // DOM 크기를 갖고 있을 수 있다(setInitError(null)의 리렌더가 아직 커밋되기 전).
      // 다음 페인트 이후 실제 높이(45vh)로 재계산하도록 relayout을 한 번 걸어준다.
      requestAnimationFrame(() => {
        try {
          map.relayout();
        } catch {
          // relayout 실패는 지도 표시 품질 문제일 뿐이므로 무시한다.
        }
      });

      return map;
    } catch {
      // 쿼터 초과, 서비스 비활성화 등으로 SDK는 로드됐지만 지도 생성 단계에서 실패하는 경우.
      setInitError('지도를 잠시 사용할 수 없어요.');
      return null;
    }
  }, []);

  // 1) SDK가 로드되면 지도 인스턴스를 한 번 생성한다.
  useEffect(() => {
    if (!isLoaded) return;
    ensureMap();
  }, [isLoaded, ensureMap]);

  // 2) pharmacies가 바뀌면 마커만 다시 만든다. 지도 인스턴스와 중심/확대 상태는 그대로 둔다.
  //    지도 생성이 이전에 실패했더라도 여기서 ensureMap()이 다시 시도하므로
  //    (컨테이너가 계속 마운트돼 있는 한) 복구 경로가 유지된다.
  useEffect(() => {
    if (!isLoaded) return;
    const map = ensureMap();
    if (!map) return;

    const kakao = window.kakao;
    // 모든 약국을 동일한 마커로 표시 — 강조/순위 없음
    const markers = pharmacies.slice(0, MAX_MARKERS).map((pharmacy) => {
      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(pharmacy.lat, pharmacy.lng),
        map,
      }) as KakaoMarker;
      kakao.maps.event.addListener(marker, 'click', () => onSelectPharmacy(pharmacy));
      return marker;
    });
    markersRef.current = markers;

    return () => {
      markers.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
    };
  }, [isLoaded, pharmacies, onSelectPharmacy, ensureMap]);

  // 언마운트 시 남은 마커를 정리하고 지도 참조를 놓아준다.
  useEffect(() => {
    return () => {
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
      mapRef.current = null;
    };
  }, []);

  // SDK 자체가 로드되지 않은 경우(쿼터 초과, 서비스 비활성화, 네트워크 실패 등)는
  // useKakaoMap의 프로미스가 이미 reject된 영구적인 실패라 재시도 대상이 아니다.
  // 컨테이너를 아예 렌더링하지 않아도 안전하므로, 빈 박스 없이 한 줄 안내만 보여준다.
  if (loadError) {
    return <p style={{ margin: '8px 16px', fontSize: 13, color: '#888' }}>{loadError}</p>;
  }

  // 아래 컨테이너는 SDK 로드 이후(isLoaded === true가 된 이후) 계속 마운트된 상태를 유지해야
  // effect가 이후 pharmacies 변경 시에도 containerRef를 통해 재시도할 수 있다.
  // initError가 나더라도 이 div를 언마운트하면 ref가 null이 되어 다음 effect 실행이
  // `if (!containerRef.current) return;`에서 즉시 멈춰버려 영영 복구되지 않는다.
  const showMap = isLoaded && !initError;

  const handleSearchThisArea = () => {
    if (!pendingBoundsRef.current || !onSearchThisAreaRef.current) return;
    onSearchThisAreaRef.current(pendingBoundsRef.current);
    setShowSearchButton(false);
  };

  return (
    <>
      {initError && <p style={{ margin: '8px 16px', fontSize: 13, color: '#888' }}>{initError}</p>}
      {!isLoaded && !initError && (
        <div style={{ width: '100%', height: MAP_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>지도를 불러오는 중이에요...</p>
        </div>
      )}
      {/* position: relative가 없으면 카카오맵이 내부적으로 그리는 타일 레이어(절대 위치)가
          이 컨테이너가 아니라 더 상위의 포지셔닝 컨텍스트를 기준으로 배치되어, 컨테이너 박스는
          정상인데 실제 지도만 부모의 padding/margin 밖으로 삐져나오는 문제가 있었다. */}
      <div
        style={{
          width: '100%',
          height: showMap ? MAP_HEIGHT : 0,
          borderRadius: showMap ? 12 : 0,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }} />
        {showMap && showSearchButton && (
          <button
            type="button"
            onClick={handleSearchThisArea}
            style={{
              position: 'absolute',
              bottom: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              // 카카오맵 마커 레이어가 자체 z-index를 갖고 있어(기본값 z-index:auto는
              // 그 아래에 깔린다), 명시적으로 더 높은 값을 줘야 버튼이 지도 위에 보인다.
              zIndex: 10,
              padding: '8px 16px',
              borderRadius: 20,
              border: 'none',
              background: '#3182F6',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
            }}
          >
            이 지역 재검색
          </button>
        )}
      </div>
    </>
  );
}
