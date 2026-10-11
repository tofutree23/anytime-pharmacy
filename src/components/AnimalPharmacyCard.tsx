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
  const contents = pharmacy.phone
    ? (
      <ListRow.Texts
        type="3RowTypeA"
        top={pharmacy.name}
        middle={bottom}
        bottom={pharmacy.phone}
      />
    )
    : <ListRow.Texts type="2RowTypeA" top={pharmacy.name} bottom={bottom} />;

  return (
    <ListRow
      border="none"
      style={{ background: '#fff', borderRadius: 16, overflow: 'hidden' }}
      contents={contents}
      withTouchEffect
      onClick={() => onClick(pharmacy)}
    />
  );
}
