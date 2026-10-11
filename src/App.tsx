import { lazy, Suspense, useState } from 'react';
import { HomePage } from './pages/HomePage';
import type { Place } from './domain/types';

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

  // HomePage를 조건부로 언마운트하면(상세 화면으로 이동 시) 다시 돌아왔을 때
  // regionPrefix/activeFilters 같은 내부 state가 전부 초기화된다. 그래서 HomePage는
  // 항상 마운트된 상태를 유지하고, 상세 화면일 때만 화면에서 감춘다(display: none).
  // 상세 화면은 HomePage 위에 겹쳐서 그린다.
  return (
    <>
      <div style={{ display: selectedPlace ? 'none' : 'block' }}>
        <HomePage onSelectPlace={setSelectedPlace} />
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
    </>
  );
}

export default App;
