import { useState } from 'react';
import { HomePage } from './pages/HomePage';
import { PharmacyDetailPage } from './pages/PharmacyDetailPage';
import type { Pharmacy } from './domain/types';

function App() {
  const [selectedPharmacy, setSelectedPharmacy] = useState<Pharmacy | null>(null);

  if (selectedPharmacy) {
    return (
      <PharmacyDetailPage pharmacy={selectedPharmacy} onBack={() => setSelectedPharmacy(null)} />
    );
  }

  return <HomePage onSelectPharmacy={setSelectedPharmacy} />;
}

export default App;
