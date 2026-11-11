import { lazy, Suspense, useEffect, useState } from 'react';
import { ConfirmDialog } from '@toss/tds-mobile';
import { HomePage } from './pages/HomePage';
import type { Place } from './domain/types';
import { detailFullScreenAd } from './lib/fullScreenAd';

// 초기 화면(HomePage)이 뜨는 데 필요한 JS만 먼저 받도록, 상세 페이지는 실제로
// 필요해질 때(약국을 선택했을 때)만 별도 청크로 불러온다.
const PharmacyDetailPage = lazy(() =>
  import('./pages/PharmacyDetailPage').then((m) => ({ default: m.PharmacyDetailPage })),
);
const AnimalPharmacyDetailPage = lazy(() =>
  import('./pages/AnimalPharmacyDetailPage').then((m) => ({ default: m.AnimalPharmacyDetailPage })),
);

function App() {
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  // 광고 안내 다이얼로그를 띄운 채 사용자의 선택을 기다리는 약국.
  const [adNoticePlace, setAdNoticePlace] = useState<Place | null>(null);

  // 첫 상세 진입 때 바로 보여줄 수 있도록 앱 시작 시점에 미리 불러둔다.
  useEffect(() => {
    detailFullScreenAd.preload();
  }, []);

  // 예고 없이 뜨는 광고는 검수 반려 사유라, 광고가 실제로 뜰 때만 안내를 먼저 보여준다.
  // 광고가 없거나 간격 제한 중이면 안내 없이 바로 상세로 간다.
  const openPlace = (place: Place) => {
    if (detailFullScreenAd.canShow()) setAdNoticePlace(place);
    else setSelectedPlace(place);
  };

  // 상세 화면을 먼저 띄우고 그 위에 광고를 덮는다. 광고가 실패해도 사용자는
  // 기다림 없이 상세 화면을 본다.
  const confirmAdNotice = () => {
    if (!adNoticePlace) return;
    setSelectedPlace(adNoticePlace);
    setAdNoticePlace(null);
    detailFullScreenAd.showIfReady();
  };

  // HomePage를 조건부로 언마운트하면(상세 화면으로 이동 시) 다시 돌아왔을 때
  // regionPrefix/activeFilters 같은 내부 state가 전부 초기화된다. 그래서 HomePage는
  // 항상 마운트된 상태를 유지하고, 상세 화면일 때만 화면에서 감춘다(display: none).
  // 상세 화면은 HomePage 위에 겹쳐서 그린다.
  return (
    <>
      <div style={{ display: selectedPlace ? 'none' : 'block' }}>
        <HomePage onSelectPlace={openPlace} />
      </div>
      {selectedPlace && (
        <Suspense fallback={null}>
          {selectedPlace.kind === 'animal' ? (
            <AnimalPharmacyDetailPage pharmacy={selectedPlace} onBack={() => setSelectedPlace(null)} />
          ) : (
            <PharmacyDetailPage pharmacy={selectedPlace} onBack={() => setSelectedPlace(null)} />
          )}
        </Suspense>
      )}
      <ConfirmDialog
        open={adNoticePlace !== null}
        title={<ConfirmDialog.Title>{adNoticePlace?.name} 정보를 보기 전에 광고가 잠깐 나와요</ConfirmDialog.Title>}
        cancelButton={<ConfirmDialog.CancelButton onClick={() => setAdNoticePlace(null)}>닫기</ConfirmDialog.CancelButton>}
        confirmButton={<ConfirmDialog.ConfirmButton onClick={confirmAdNotice}>광고 보고 상세 보기</ConfirmDialog.ConfirmButton>}
        onClose={() => setAdNoticePlace(null)}
      />
    </>
  );
}

export default App;
