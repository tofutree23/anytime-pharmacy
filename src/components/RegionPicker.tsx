import { List, ListRow, Top, Paragraph } from '@toss/tds-mobile';
import { REGIONS } from '../domain/regions';
import { ComplianceNotice } from './ComplianceNotice';

type RegionPickerProps = {
  onSelect: (regionPrefix: string) => void;
  onUseCurrentLocation?: () => void;
  // OS 설정 자체에서 위치 권한이 막혀 있는 경우(osPermissionDenied). 앱 안에서는
  // 재요청할 방법이 없으므로 "내 위치 근처" 버튼 대신 설정 안내 문구만 보여준다.
  locationBlocked?: boolean;
};

export function RegionPicker({ onSelect, onUseCurrentLocation, locationBlocked }: RegionPickerProps) {
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
            {locationBlocked
              ? '설정 앱에서 위치 권한을 켜면 내 주변 약국을 바로 찾을 수 있어요.'
              : onUseCurrentLocation
                ? '내 위치 또는 원하는 지역을 기준으로 찾아보세요.'
                : '위치 정보를 사용할 수 없어 지역으로 약국을 찾아드려요.'}
          </Paragraph>
        }
      />
      <ComplianceNotice />
      <List>
        {onUseCurrentLocation && (
          <ListRow
            contents={<ListRow.Texts type="1RowTypeA" top="내 위치 근처" />}
            onClick={onUseCurrentLocation}
          />
        )}
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
