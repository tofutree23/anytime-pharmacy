import { useEffect, useRef } from 'react';
import { useKakaoMap } from '../hooks/useKakaoMap';
import type { Pharmacy } from '../domain/types';

type PharmacyMapProps = {
  pharmacies: Pharmacy[];
  center: { lat: number; lng: number } | null;
  onSelectPharmacy: (pharmacy: Pharmacy) => void;
};

export function PharmacyMap({ pharmacies, center, onSelectPharmacy }: PharmacyMapProps) {
  const { isLoaded, error } = useKakaoMap();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoaded || !containerRef.current) return;

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
  }, [isLoaded, pharmacies, center, onSelectPharmacy]);

  if (error) {
    return <p>{error}</p>;
  }

  if (!isLoaded) {
    return <p>지도를 불러오는 중이에요...</p>;
  }

  return <div ref={containerRef} style={{ width: '100%', height: '400px' }} />;
}
