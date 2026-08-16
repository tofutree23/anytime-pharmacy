import { useState } from 'react';
import { HomePage } from './pages/HomePage';
import type { Pharmacy } from './domain/types';

function App() {
  const [selectedPharmacy, setSelectedPharmacy] = useState<Pharmacy | null>(null);

  if (selectedPharmacy) {
    // Task 11에서 PharmacyDetailPage로 교체
    return (
      <button type="button" onClick={() => setSelectedPharmacy(null)}>
        목록으로
      </button>
    );
  }

  return <HomePage onSelectPharmacy={setSelectedPharmacy} />;
}

export default App;
