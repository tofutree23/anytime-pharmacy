import { useEffect, useRef, useState } from 'react';
import { useKakaoMap } from '../hooks/useKakaoMap';
import type { Pharmacy } from '../domain/types';

type PharmacyMapProps = {
  pharmacies: Pharmacy[];
  center: { lat: number; lng: number } | null;
  onSelectPharmacy: (pharmacy: Pharmacy) => void;
};

const MAP_HEIGHT = '45vh';

export function PharmacyMap({ pharmacies, center, onSelectPharmacy }: PharmacyMapProps) {
  const { isLoaded, error: loadError } = useKakaoMap();
  const [initError, setInitError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoaded || !containerRef.current) return;

    setInitError(null);

    try {
      const kakao = window.kakao;
      const fallbackCenter = pharmacies[0]
        ? { lat: pharmacies[0].lat, lng: pharmacies[0].lng }
        : { lat: 37.5665, lng: 126.978 }; // 서울시청 기본값
      const mapCenter = center ?? fallbackCenter;

      const map = new kakao.maps.Map(containerRef.current, {
        center: new kakao.maps.LatLng(mapCenter.lat, mapCenter.lng),
        level: 5,
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

      // 모든 약국을 동일한 마커로 표시 — 강조/순위 없음
      const markers = pharmacies.map((pharmacy) => {
        const marker = new kakao.maps.Marker({
          position: new kakao.maps.LatLng(pharmacy.lat, pharmacy.lng),
          map,
        });
        kakao.maps.event.addListener(marker, 'click', () => onSelectPharmacy(pharmacy));
        return marker;
      });

      return () => {
        markers.forEach((marker) => marker.setMap(null));
      };
    } catch {
      // 쿼터 초과, 서비스 비활성화 등으로 SDK는 로드됐지만 지도 생성 단계에서 실패하는 경우.
      setInitError('지도를 잠시 사용할 수 없어요.');
      return;
    }
  }, [isLoaded, pharmacies, center, onSelectPharmacy]);

  // SDK 자체가 로드되지 않은 경우(쿼터 초과, 서비스 비활성화, 네트워크 실패 등)는
  // useKakaoMap의 프로미스가 이미 reject된 영구적인 실패라 재시도 대상이 아니다.
  // 컨테이너를 아예 렌더링하지 않아도 안전하므로, 빈 박스 없이 한 줄 안내만 보여준다.
  if (loadError) {
    return <p style={{ margin: '8px 16px', fontSize: 13, color: '#888' }}>{loadError}</p>;
  }

  // 아래 컨테이너는 SDK 로드 이후(isLoaded === true가 된 이후) 계속 마운트된 상태를 유지해야
  // effect가 이후 pharmacies/center 변경 시에도 containerRef를 통해 재시도할 수 있다.
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
