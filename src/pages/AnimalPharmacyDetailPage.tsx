import { TopNavigation, TopNavigationBackButton, Paragraph } from '@toss/tds-mobile';
import type { AnimalPharmacy } from '../domain/types';
import { ComplianceNotice } from '../components/ComplianceNotice';

type AnimalPharmacyDetailPageProps = {
  pharmacy: AnimalPharmacy;
  onBack: () => void;
};

export function AnimalPharmacyDetailPage({ pharmacy, onBack }: AnimalPharmacyDetailPageProps) {
  return (
    <div>
      <TopNavigation
        leading={<TopNavigationBackButton onClick={onBack} aria-label="뒤로 가기" />}
        content={pharmacy.name}
      />
      <Paragraph typography="st11" style={{ padding: '8px 16px' }}>{pharmacy.address}</Paragraph>
      {pharmacy.phone && (
        <a href={`tel:${pharmacy.phone}`}>
          <Paragraph typography="st11" color="blue500" style={{ padding: '0 16px 8px' }}>
            {pharmacy.phone}
          </Paragraph>
        </a>
      )}
      <Paragraph typography="st11" color="#6b7684" style={{ padding: '8px 16px' }}>
        동물약국은 영업시간 정보가 제공되지 않아요. 방문 전 전화로 확인해 주세요.
      </Paragraph>
      <ComplianceNotice />
      <Paragraph typography="st11" color="grey500" style={{ padding: '8px 16px' }}>
        {pharmacy.source} · {new Date(pharmacy.updatedAt).toLocaleString('ko-KR')} 기준
      </Paragraph>
    </div>
  );
}
