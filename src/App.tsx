import { useState } from 'react';
import { HomePage } from './pages/HomePage';
import { PharmacyDetailPage } from './pages/PharmacyDetailPage';
import type { Pharmacy } from './domain/types';

function App() {
  const [selectedPharmacy, setSelectedPharmacy] = useState<Pharmacy | null>(null);

  // HomePage를 조건부로 언마운트하면(상세 화면으로 이동 시) 다시 돌아왔을 때
  // regionPrefix/activeFilters 같은 내부 state가 전부 초기화된다. 그래서 HomePage는
  // 항상 마운트된 상태를 유지하고, 상세 화면일 때만 화면에서 감춘다(display: none).
  // 상세 화면은 HomePage 위에 겹쳐서 그린다.
  return (
    <>
      <div style={{ display: selectedPharmacy ? 'none' : 'block' }}>
        <HomePage onSelectPharmacy={setSelectedPharmacy} />
      </div>
      {selectedPharmacy && (
        <PharmacyDetailPage pharmacy={selectedPharmacy} onBack={() => setSelectedPharmacy(null)} />
      )}
    </>
  );
}

export default App;
