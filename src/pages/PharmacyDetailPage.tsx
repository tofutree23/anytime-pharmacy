import { TopNavigation, TopNavigationBackButton, List, ListRow, Paragraph, Badge } from '@toss/tds-mobile';
import type { Pharmacy, DutyTime } from '../domain/types';
import { getTodayDutyKey } from '../domain/businessHours';
import { ComplianceNotice } from '../components/ComplianceNotice';

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
  // businessHours.ts의 KST 기준 로직을 그대로 재사용해 "오늘" 요일을 계산한다.
  // (raw Date.getDay()는 호스트 타임존에 따라 요일이 어긋날 수 있어 사용하지 않는다.)
  const todayKey = getTodayDutyKey(new Date());

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
          const isToday = key === todayKey;
          return (
            <ListRow
              key={key}
              style={isToday ? { background: '#F8FBFF' } : undefined}
              contents={
                <ListRow.Texts
                  type="1RowTypeA"
                  top={
                    isToday ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {label}
                        <Badge variant="fill" color="blue" size="small">
                          오늘
                        </Badge>
                      </span>
                    ) : (
                      label
                    )
                  }
                />
              }
              right={
                <Paragraph typography="st10">
                  {hours ? `${formatHHmm(hours.open)} ~ ${formatHHmm(hours.close)}` : '휴무'}
                </Paragraph>
              }
            />
          );
        })}
      </List>

      <ComplianceNotice />

      <Paragraph typography="st11" color="grey500" style={{ padding: '8px 16px' }}>
        {pharmacy.source} · {new Date(pharmacy.updatedAt).toLocaleString('ko-KR')} 기준
      </Paragraph>
    </div>
  );
}
