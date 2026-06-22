import { formatCurrency } from './formatters';
import { toLocalDateString } from '../../../utils/dateUtils';

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

export function formatReportDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const s = String(iso).slice(0, 10);
  try {
    return toLocalDateString(s);
  } catch {
    return s;
  }
}

export function formatReportCurrency(amount: number | string | null | undefined): string {
  return formatCurrency(Number(amount ?? 0));
}

export function payrollReportFileName(reportKey: string, filters?: { month?: number; year?: number }): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const period =
    filters?.year && filters?.month
      ? `_${filters.year}-${String(filters.month).padStart(2, '0')}`
      : '';
  return `payroll-${reportKey}${period}_${stamp}.csv`;
}

export function rowsToCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const escape = (v: string) => {
    if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  const header = columns.map((c) => escape(c.header)).join(',');
  const body = rows
    .map((row) =>
      columns
        .map((c) => {
          const raw = c.value(row);
          const text = raw == null ? '' : String(raw);
          return escape(text);
        })
        .join(',')
    )
    .join('\n');
  return `${header}\n${body}`;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
