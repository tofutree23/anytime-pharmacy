import { TopNavigation, TopNavigationBackButton, List, ListRow, Paragraph } from '@toss/tds-mobile';
import type { Pharmacy, DutyTime } from '../domain/types';

const DAY_LABELS: Array<[keyof DutyTime, string]> = [
  ['mon', '월요일'],
  ['tue', '화요일'],
  ['wed', '수요일'],
  ['thu', '목요일'],
  ['fri', '금요일'],
  ['sat', '토요일'],
  ['sun', '일요일'],
  ['holiday', '공휴일'],
];

function formatHHmm(value: string): string {
  return `${value.slice(0, 2)}:${value.slice(2, 4)}`;
}

type PharmacyDetailPageProps = {
  pharmacy: Pharmacy;
  onBack: () => void;
};

export function PharmacyDetailPage({ pharmacy, onBack }: PharmacyDetailPageProps) {
  return (
    <div>
      <TopNavigation
        leading={<TopNavigationBackButton onClick={onBack} aria-label="뒤로 가기" />}
        content={pharmacy.name}
      />

      <Paragraph typography="st10" style={{ padding: '8px 16px' }}>
        {pharmacy.address}
      </Paragraph>
      {pharmacy.phone && (
        <a href={`tel:${pharmacy.phone}`}>
          <Paragraph typography="st10" color="blue500" style={{ padding: '0 16px 8px' }}>
            {pharmacy.phone}
          </Paragraph>
        </a>
      )}

      <List>
        {DAY_LABELS.map(([key, label]) => {
          const hours = pharmacy.dutyTime[key];
          return (
            <ListRow
              key={key}
              contents={<ListRow.Texts type="1RowTypeA" top={label} />}
              right={
                <Paragraph typography="st10">
                  {hours ? `${formatHHmm(hours.open)} ~ ${formatHHmm(hours.close)}` : '휴무'}
                </Paragraph>
              }
            />
          );
        })}
      </List>

      <Paragraph typography="st11" color="grey500" style={{ padding: '8px 16px' }}>
        {pharmacy.source} · {new Date(pharmacy.updatedAt).toLocaleString('ko-KR')} 기준
      </Paragraph>
    </div>
  );
}
