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
    // TDS List/ListRow의 기본 스타일은 한 컨테이너 안에 구분선으로 나뉜 행 목록이라,
    // 참조 디자인의 "떠 있는 카드(gap 12px, radius 16px)" 느낌과 다르다.
    // ListRow(li)는 native li props와 merge되어 style을 직접 받으므로, 별도 래핑 div
    // 없이 ListRow 자체에 흰 배경/둥근 모서리를 준다. border="none"으로 구분선도 없앤다.
    <ListRow
      border="none"
      style={{ background: '#fff', borderRadius: 16, overflow: 'hidden' }}
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
