import { ListRow } from '@toss/tds-mobile';
import type { AnimalPharmacy } from '../domain/types';
import { formatDistance } from '../domain/formatDistance';

type AnimalPharmacyCardProps = {
  pharmacy: AnimalPharmacy;
  onClick: (pharmacy: AnimalPharmacy) => void;
};

export function AnimalPharmacyCard({ pharmacy, onClick }: AnimalPharmacyCardProps) {
  const bottom = pharmacy.distanceMeters != null
    ? `${formatDistance(pharmacy.distanceMeters)}, ${pharmacy.address}`
    : pharmacy.address;

  return (
    <ListRow
      border="none"
      style={{ background: '#fff', borderRadius: 16, overflow: 'hidden' }}
      contents={<ListRow.Texts type="2RowTypeA" top={pharmacy.name} bottom={bottom} />}
      withTouchEffect
      onClick={() => onClick(pharmacy)}
    />
  );
}
