import React, { useId } from 'react';
import { Download, Loader2, Printer } from 'lucide-react';
import { usePrintReport } from '../../../hooks/usePrintReport';
import ReportHeader from '../../reports/ReportHeader';
import ReportFooter from '../../reports/ReportFooter';

type PeriodFiltersProps = {
  month: number;
  year: number;
  onMonthChange: (m: number) => void;
  onYearChange: (y: number) => void;
  status?: string;
  onStatusChange?: (s: string) => void;
  statusOptions?: string[];
};

export function PeriodFilters({
  month,
  year,
  onMonthChange,
  onYearChange,
  status,
  onStatusChange,
  statusOptions,
}: PeriodFiltersProps) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <label className="text-xs font-semibold text-app-muted">
        Month
        <input
          type="number"
          min={1}
          max={12}
          value={month}
          onChange={(e) => onMonthChange(Number(e.target.value))}
          className="ml-1 w-16 rounded-lg border border-app-border px-2 py-1 text-sm text-app-text"
        />
      </label>
      <label className="text-xs font-semibold text-app-muted">
        Year
        <input
          type="number"
          value={year}
          onChange={(e) => onYearChange(Number(e.target.value))}
          className="ml-1 w-20 rounded-lg border border-app-border px-2 py-1 text-sm text-app-text"
        />
      </label>
      {onStatusChange && statusOptions && (
        <label className="text-xs font-semibold text-app-muted">
          Status
          <select
            value={status ?? ''}
            onChange={(e) => onStatusChange(e.target.value)}
            className="ml-1 rounded-lg border border-app-border px-2 py-1 text-sm text-app-text"
          >
            <option value="">All</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

type ShellProps = {
  title: string;
  subtitle?: string;
  loading?: boolean;
  error?: string | null;
  filters?: React.ReactNode;
  onExportCsv?: () => void;
  exporting?: boolean;
  children: React.ReactNode;
  companyName?: string;
};

const PayrollReportShell: React.FC<ShellProps> = ({
  title,
  subtitle,
  loading,
  error,
  filters,
  onExportCsv,
  exporting,
  children,
  companyName,
}) => {
  const printReport = usePrintReport();
  const printId = useId().replace(/:/g, '');

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-app-text">{title}</h3>
          {subtitle && <p className="text-sm text-app-muted mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {onExportCsv && (
            <button
              type="button"
              disabled={exporting || loading}
              onClick={onExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-app-border text-sm font-semibold hover:bg-app-toolbar disabled:opacity-50"
            >
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              CSV
            </button>
          )}
          <button
            type="button"
            onClick={() => printReport(printId)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-app-border text-sm font-semibold hover:bg-app-toolbar"
          >
            <Printer size={14} /> Print
          </button>
        </div>
      </div>
      {filters}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-app-muted" size={24} /></div>
      ) : (
        <div id={printId}>
          <ReportHeader title={title} subtitle={subtitle} companyName={companyName} />
          {children}
          <ReportFooter />
        </div>
      )}
    </div>
  );
};

export default PayrollReportShell;
