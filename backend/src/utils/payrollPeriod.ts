/** English month labels as stored on `payroll_runs.month` (see payroll UI). */
const MONTH_LABEL_TO_NUM: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Resolve `month` column (full name or 1–12) to calendar month index 1–12. */
export function resolvePayrollMonthNumber(monthRaw: string): number | null {
  const t = String(monthRaw ?? '')
    .trim()
    .toLowerCase();
  if (!t) return null;
  const digits = /^(\d{1,2})$/.exec(t);
  if (digits) {
    const n = Number(digits[1]);
    return n >= 1 && n <= 12 ? n : null;
  }
  return MONTH_LABEL_TO_NUM[t] ?? null;
}

/**
 * First calendar day and last calendar day of a payroll period (UTC date parts).
 * Used when `period_start` / `period_end` were never set on the run row.
 */
export function payPeriodCalendarBounds(monthRaw: string, yearRaw: number): { start: string; end: string } | null {
  const mn = resolvePayrollMonthNumber(monthRaw);
  const year = Number(yearRaw);
  if (mn === null || !Number.isFinite(year) || year < 1901 || year > 3000) return null;

  const start = `${year}-${pad2(mn)}-01`;
  const anchor = Date.UTC(year, mn, 0);
  const d = new Date(anchor);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const end = `${y}-${pad2(m)}-${pad2(day)}`;
  return { start, end };
}
