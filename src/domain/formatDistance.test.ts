import { expect, it } from 'vitest';
import { formatDistance } from './formatDistance';

it('1km 미만은 미터, 이상은 소수점 한 자리 km', () => {
  expect(formatDistance(320.4)).toBe('320m');
  expect(formatDistance(999.6)).toBe('1000m');
  expect(formatDistance(1234)).toBe('1.2km');
});
