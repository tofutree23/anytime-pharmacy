import { Paragraph } from '@toss/tds-mobile';

// 모든 화면(홈/지역 선택/상세)에 항상 노출되는 고지 문구.
// 두 줄 모두 안내성 정보라 톤/길이를 맞춰 하나의 컴포넌트에 함께 둔다.
export function ComplianceNotice() {
  return (
    <div style={{ padding: '8px 16px' }}>
      <Paragraph typography="st10" color="#6b7684">
        본 서비스는 예약·추천 기능이 없으며, 공공데이터를 동일한 기준으로 제공해요.
      </Paragraph>
      <Paragraph typography="st10" color="#6b7684">
        이 정보는 공공데이터 기준이라 실제 운영 상황과 다를 수 있어요. 방문 전 전화로 확인해 주세요.
      </Paragraph>
    </div>
  );
}
