import { Chip, ChipItem } from '@toss/tds-mobile';

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
    <Chip aria-label="약국 필터" margin="medium">
      {FILTER_KEYS.map((key) => (
        <ChipItem key={key} selected={active.includes(key)} onClick={() => onToggle(key)}>
          {FILTER_LABELS[key]}
        </ChipItem>
      ))}
    </Chip>
  );
}
