/**
 * Inventory management display formatting.
 * Rounds values to the nearest 100 for clean UI display only.
 * Actual data and calculations must use raw values; use these helpers only when rendering.
 */

/** Round a number to the nearest 100 for display. Does not mutate data. */
export function roundToNearest100(value: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.round(value / 100) * 100;
}

/** Format a number for display: rounded to nearest 100, then locale string. */
export function formatInvAmount(value: number): string {
  return roundToNearest100(value).toLocaleString();
}
