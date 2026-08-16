import { ListRow, Badge } from '@toss/tds-mobile';
import type { Pharmacy } from '../domain/types';
import { isOpenNow } from '../domain/businessHours';

type PharmacyCardProps = {
  pharmacy: Pharmacy;
  onClick: (pharmacy: Pharmacy) => void;
};

export function PharmacyCard({ pharmacy, onClick }: PharmacyCardProps) {
  const open = isOpenNow(pharmacy.dutyTime, new Date());

  return (
    <ListRow
      contents={<ListRow.Texts type="2RowTypeA" top={pharmacy.name} bottom={pharmacy.address} />}
      right={
        <Badge variant="fill" color={open ? 'blue' : 'elephant'} size="small">
          {open ? '영업중' : '영업종료'}
        </Badge>
      }
      withTouchEffect
      onClick={() => onClick(pharmacy)}
    />
  );
}
