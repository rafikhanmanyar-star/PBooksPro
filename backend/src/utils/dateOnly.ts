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
 * Format a PostgreSQL DATE column value as `YYYY-MM-DD` for API JSON.
 *
 * With the custom type parser in pool.ts, DATE (OID 1082) columns now arrive
 * as raw `'YYYY-MM-DD'` strings, so the string path is the normal case.
 * The Date path (UTC calendar components) is kept for TIMESTAMP columns and
 * any legacy code that still passes Date objects.
 */
export function formatPgDateToYyyyMmDd(d: Date | string | null | undefined): string {
  if (d == null) return '';
  if (typeof d === 'string') {
    const t = d.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const prefix = t.match(/^(\d{4}-\d{2}-\d{2})/);
    if (prefix) return prefix[1];
    return t || '';
  }
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Alias for `formatPgDateToYyyyMmDd` — preferred name in new code. */
export const pgDateToString = formatPgDateToYyyyMmDd;

/** Server default for a `date` column when the client omits a value (UTC calendar day). */
export function todayUtcYyyyMmDd(): string {
  return formatPgDateToYyyyMmDd(new Date());
}
