/** Fiscal period helpers for financial statements. */

export function fiscalYearStartForDate(fiscalStartMonth: number, asOfDate: string): string {
  const d = new Date(asOfDate);
  const calYear = d.getFullYear();
  const calMonth = d.getMonth() + 1;
  const fyStartYear = calMonth >= fiscalStartMonth ? calYear : calYear - 1;
  return `${fyStartYear}-${String(fiscalStartMonth).padStart(2, '0')}-01`;
}

export function fiscalYearEndForDate(fiscalStartMonth: number, asOfDate: string): string {
  const start = fiscalYearStartForDate(fiscalStartMonth, asOfDate);
  const [y, m] = start.split('-').map(Number);
  const endYear = fiscalStartMonth === 1 ? y : y + 1;
  const endMonth = fiscalStartMonth === 1 ? 12 : fiscalStartMonth - 1;
  const lastDay = new Date(endYear, endMonth, 0).getDate();
  return `${endYear}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/** Last day of the fiscal year immediately before the one containing `asOfDate`. */
export function priorFiscalYearEnd(fiscalStartMonth: number, asOfDate: string): string {
  const fyStart = fiscalYearStartForDate(fiscalStartMonth, asOfDate);
  const d = new Date(fyStart);
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function priorMonthEnd(asOfDate: string): string {
  const d = new Date(asOfDate);
  const last = new Date(d.getFullYear(), d.getMonth(), 0);
  const y = last.getFullYear();
  const mo = last.getMonth() + 1;
  const day = last.getDate();
  return `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export type BalanceSheetCompareMode = 'none' | 'prior_year' | 'prior_month';

export function compareAsOfDate(
  asOfDate: string,
  mode: BalanceSheetCompareMode,
  fiscalStartMonth = 1
): string | undefined {
  if (mode === 'none') return undefined;
  if (mode === 'prior_year') return priorFiscalYearEnd(fiscalStartMonth, asOfDate);
  return priorMonthEnd(asOfDate);
}
