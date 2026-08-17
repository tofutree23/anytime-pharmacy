import { ListRow, Badge } from '@toss/tds-mobile';
import type { Pharmacy } from '../domain/types';
import { isOpenNow } from '../domain/businessHours';

type PharmacyCardProps = {
  pharmacy: Pharmacy;
  onClick: (pharmacy: Pharmacy) => void;
};

/** 1km 미만은 미터, 그 이상은 소수점 한 자리 km로 표기한다. */
function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export function PharmacyCard({ pharmacy, onClick }: PharmacyCardProps) {
  const open = isOpenNow(pharmacy.dutyTime, new Date());
  // 지역 조회에는 기준점이 없어 거리가 없다. 이 경우 거리 표기를 생략한다.
  const bottom =
    pharmacy.distanceMeters != null
      ? `${formatDistance(pharmacy.distanceMeters)}, ${pharmacy.address}`
      : pharmacy.address;

  return (
    <ListRow
      contents={<ListRow.Texts type="2RowTypeA" top={pharmacy.name} bottom={bottom} />}
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
