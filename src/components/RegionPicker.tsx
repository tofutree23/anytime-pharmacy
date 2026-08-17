import { List, ListRow, Top } from '@toss/tds-mobile';
import { REGIONS } from '../domain/regions';
import { ComplianceNotice } from './ComplianceNotice';

type RegionPickerProps = {
  onSelect: (regionPrefix: string) => void;
};

export function RegionPicker({ onSelect }: RegionPickerProps) {
  return (
    <div>
      <Top
        title="지역을 선택해 주세요"
        subtitleBottom="위치 정보를 사용할 수 없어 지역으로 약국을 찾아드려요."
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
