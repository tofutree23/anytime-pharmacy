import { Button } from '@toss/tds-mobile';

export type FilterKey = 'openNow' | 'night' | 'allDay' | 'holiday';

const FILTER_LABELS: Record<FilterKey, string> = {
  openNow: '지금 영업중',
  night: '심야 영업 (22시 이후)',
  allDay: '24시간 영업',
  holiday: '공휴일 영업',
};

const FILTER_KEYS = Object.keys(FILTER_LABELS) as FilterKey[];

type FilterBarProps = {
  active: FilterKey[];
  onToggle: (key: FilterKey) => void;
};

export function FilterBar({ active, onToggle }: FilterBarProps) {
  return (
    <div
      role="group"
      aria-label="약국 필터"
      // 필터가 4개로 늘어나면서(특히 "심야 영업 (22시 이후)") 430px 프레임 폭에서
      // 한 줄에 다 안 들어갈 수 있어, 줄바꿈 대신 가로 스크롤로 처리한다.
      style={{ display: 'flex', gap: 8, padding: '0 16px', overflowX: 'auto' }}
    >
      {FILTER_KEYS.map((key) => {
        const selected = active.includes(key);
        return (
          <Button
            key={key}
            type="button"
            size="small"
            display="inline"
            variant={selected ? 'fill' : 'weak'}
            aria-pressed={selected}
            onClick={() => onToggle(key)}
            style={{ flexShrink: 0 }}
          >
            {FILTER_LABELS[key]}
          </Button>
        );
      })}
    </div>
  );
}
