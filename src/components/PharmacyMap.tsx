import { useCallback, useEffect, useRef, useState } from 'react';
import { useKakaoMap } from '../hooks/useKakaoMap';
import type { Pharmacy } from '../domain/types';

type PharmacyMapProps = {
  pharmacies: Pharmacy[];
  center: { lat: number; lng: number } | null;
  onSelectPharmacy: (pharmacy: Pharmacy) => void;
};

// 375px 폭 기준 참조 디자인은 지도 높이 220px(뷰포트의 약 25~30%)를 사용한다.
// 기존 45vh는 지도가 화면을 과도하게 차지해 리스트가 밀리는 문제가 있어,
// 리스트 중심 레이아웃에 맞게 고정 픽셀 값으로 낮춘다.
const MAP_HEIGHT = '240px';
// 마커는 한 개씩 동기적으로 생성되므로 행 수가 많으면 그대로 프리즈로 이어진다.
// 호출자가 상한 없는 배열을 넘기더라도 안전하도록 방어적으로 자른다.
const MAX_MARKERS = 200;

type KakaoMap = { relayout: () => void };
type KakaoMarker = { setMap: (map: unknown) => void };

export function PharmacyMap({ pharmacies, center, onSelectPharmacy }: PharmacyMapProps) {
  const { isLoaded, error: loadError } = useKakaoMap();
  const [initError, setInitError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const markersRef = useRef<KakaoMarker[]>([]);

  // 최초 지도 생성 시점의 중심 좌표로만 사용한다. 이후 center가 바뀌어도
  // 사용자가 이동/확대한 지도를 다시 중앙으로 되돌리지 않는다.
  const centerRef = useRef(center);
  const pharmaciesRef = useRef(pharmacies);

  // 렌더 중 ref를 쓰지 않도록, 최신 값 동기화는 지도 생성 effect보다 먼저 선언된
  // 이 effect에서 처리한다(선언 순서대로 실행된다).
  useEffect(() => {
    centerRef.current = center;
    pharmaciesRef.current = pharmacies;
  }, [center, pharmacies]);

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

  return (
    <>
      {initError && <p style={{ margin: '8px 16px', fontSize: 13, color: '#888' }}>{initError}</p>}
      {!isLoaded && !initError && (
        <div style={{ width: '100%', height: MAP_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>지도를 불러오는 중이에요...</p>
        </div>
      )}
      <div
        ref={containerRef}
        style={{ width: '100%', height: showMap ? MAP_HEIGHT : 0, overflow: 'hidden' }}
      />
    </>
  );
}
