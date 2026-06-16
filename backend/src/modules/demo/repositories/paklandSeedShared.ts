/** Shared helpers/constants for Pakland presentation seed (tenant pakland-001). */

export const PAKLAND_TENANT_ID = 'pakland-001';
export const PAKLAND_PREFIX = 'pkld';

export const SELLING_PROJECTS = [
  'Pakland Tower 1',
  'Paklan Tower 2',
  'Pakland Trade center',
  'PAKLAND BUSINESS CENTRE',
] as const;

export const RENTAL_BUILDINGS = [
  'Vista',
  'Pak China Mall',
  'PakLand city center',
  'PAKLAND SQUARE',
] as const;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function pkldId(...parts: (string | number)[]): string {
  return `${PAKLAND_PREFIX}-${parts.join('-')}`;
}

export function padMonth(d: Date): string {
  return String(d.getMonth() + 1).padStart(2, '0');
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${padMonth(d)}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Months ago from today (0 = current month). */
export function monthStart(offsetMonths: number, base = new Date()): string {
  const d = new Date(base.getFullYear(), base.getMonth() - offsetMonths, 1);
  return isoDate(d);
}

export function monthDay(offsetMonths: number, day: number, base = new Date()): string {
  const d = new Date(base.getFullYear(), base.getMonth() - offsetMonths, day);
  return isoDate(d);
}

export function rentalMonth(offsetMonths: number, base = new Date()): string {
  const d = new Date(base.getFullYear(), base.getMonth() - offsetMonths, 1);
  return `${d.getFullYear()}-${padMonth(d)}`;
}

export function payrollPeriod(offsetMonths: number, base = new Date()) {
  const d = new Date(base.getFullYear(), base.getMonth() - offsetMonths, 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    month: MONTH_NAMES[d.getMonth()],
    year: d.getFullYear(),
    start: isoDate(d),
    end: isoDate(last),
  };
}

export function monthName(d: Date): string {
  return MONTH_NAMES[d.getMonth()];
}
