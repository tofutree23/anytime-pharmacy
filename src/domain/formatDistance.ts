/** 1km 미만은 미터, 그 이상은 소수점 한 자리 km로 표기한다. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}
