import { Button } from '@toss/tds-mobile';

export type FilterKey = 'openNow' | 'night' | 'holiday';

const FILTER_LABELS: Record<FilterKey, string> = {
  openNow: '지금 영업중',
  night: '심야 영업',
  holiday: '공휴일 영업',
};

const FILTER_KEYS = Object.keys(FILTER_LABELS) as FilterKey[];

type FilterBarProps = {
  active: FilterKey[];
  onToggle: (key: FilterKey) => void;
};

export function FilterBar({ active, onToggle }: FilterBarProps) {
  return (
    <div role="group" aria-label="약국 필터" style={{ display: 'flex', gap: 8, padding: '0 16px' }}>
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
          >
            {FILTER_LABELS[key]}
          </Button>
        );
      })}
    </div>
  );
}
