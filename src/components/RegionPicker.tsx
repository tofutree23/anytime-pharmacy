import { List, ListRow, Top, Paragraph } from '@toss/tds-mobile';
import { REGIONS } from '../domain/regions';
import { ComplianceNotice } from './ComplianceNotice';

type RegionPickerProps = {
  onSelect: (regionPrefix: string) => void;
};

export function RegionPicker({ onSelect }: RegionPickerProps) {
  return (
    <div>
      <Top
        title={
          <Paragraph typography="t4" fontWeight="bold">
            지역을 선택해 주세요
          </Paragraph>
        }
        subtitleBottom={
          <Paragraph typography="st11" color="#4E5968">
            위치 정보를 사용할 수 없어 지역으로 약국을 찾아드려요.
          </Paragraph>
        }
      />
      <ComplianceNotice />
      <List>
        {REGIONS.map((region) => (
          <ListRow
            key={region}
            contents={<ListRow.Texts type="1RowTypeA" top={region} />}
            onClick={() => onSelect(region)}
          />
        ))}
      </List>
    </div>
  );
}
