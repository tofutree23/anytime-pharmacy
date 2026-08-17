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

  const error = loadError ?? initError;

  // 지도를 쓸 수 없을 때는 빈 박스나 큰 에러 영역을 남기지 않고,
  // 목록이 화면을 온전히 채울 수 있도록 한 줄 안내만 최소한으로 보여준다.
  if (error) {
    return <p style={{ margin: '8px 16px', fontSize: 13, color: '#888' }}>{error}</p>;
  }

  if (!isLoaded) {
    return (
      <div style={{ width: '100%', height: MAP_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>지도를 불러오는 중이에요...</p>
      </div>
    );
  }

  return <div ref={containerRef} style={{ width: '100%', height: MAP_HEIGHT }} />;
}
