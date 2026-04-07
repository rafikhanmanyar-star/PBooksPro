/**
 * Parse client-provided calendar dates for PostgreSQL `date` columns.
 *
 * `new Date(s).toISOString().slice(0, 10)` is wrong for values like `2022-10-18T00:00:00`
 * without `Z` (interpreted as local midnight) — UTC conversion can store the previous day.
 *
 * - Pure `YYYY-MM-DD` → use as-is.
 * - ISO strings starting with `YYYY-MM-DD` → use that date part (calendar intent).
 * - Otherwise → parse as Date and use **local** getFullYear/getMonth/getDate (not UTC).
 */
export function parseApiDateToYyyyMmDd(dateRaw: unknown): string {
  if (dateRaw == null || dateRaw === '') throw new Error('date is required.');
  const s = String(dateRaw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const prefix = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (prefix) return prefix[1];
  const d = new Date(s);
  if (isNaN(d.getTime())) throw new Error('Invalid date.');
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseApiDateToYyyyMmDdOptional(dateRaw: unknown): string | null {
  if (dateRaw == null || dateRaw === '') return null;
  const s = String(dateRaw).trim();
  if (s === '') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const prefix = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (prefix) return prefix[1];
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Format a `Date` from PostgreSQL (node-pg `date` / `timestamp`) as `YYYY-MM-DD` for API JSON.
 * Uses **UTC** calendar components — pg `date` values are represented as UTC midnight for that calendar day.
 * Do not use `d.toISOString().slice(0, 10)` alone; it matches only when the server TZ is UTC.
 */
export function formatPgDateToYyyyMmDd(d: Date): string {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Server default for a `date` column when the client omits a value (UTC calendar day). */
export function todayUtcYyyyMmDd(): string {
  return formatPgDateToYyyyMmDd(new Date());
}
