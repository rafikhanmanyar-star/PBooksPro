import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { isAccountingBackedByRemoteApi } from '../../../config/apiUrl';
import payrollReportsApi from '../../../services/api/payrollReportsApi';
import PayrollReportShell, { PeriodFilters } from './PayrollReportShell';
import {
  downloadCsv,
  formatReportCurrency,
  payrollReportFileName,
  rowsToCsv,
} from '../utils/payrollReportExport';

type Row = {
  payroll_period: string;
  approved_payroll: number;
  payments_made: number;
  outstanding_liability: number;
  employees_remaining: number;
  run_status: string;
};

const PayrollLiabilityReport: React.FC = () => {
  const { tenant } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const isApi = isAccountingBackedByRemoteApi();

  const q = useQuery({
    queryKey: ['payroll-report', 'liability', month, year],
    enabled: isApi,
    queryFn: () => payrollReportsApi.getLiability({ month, year }),
  });

  const rows = (q.data?.rows ?? []) as Row[];
  const totals = q.data?.totals;

  const exportCsv = () => {
    downloadCsv(
      payrollReportFileName('liability', { month, year }),
      rowsToCsv(
        [
          { header: 'Payroll Period', value: (r) => r.payroll_period },
          { header: 'Approved Payroll', value: (r) => r.approved_payroll },
          { header: 'Payments Made', value: (r) => r.payments_made },
          { header: 'Outstanding Liability', value: (r) => r.outstanding_liability },
          { header: 'Employees Remaining', value: (r) => r.employees_remaining },
          { header: 'Run Status', value: (r) => r.run_status },
        ],
        rows
      )
    );
  };

  if (!isApi) {
    return <p className="text-sm text-app-muted p-4">Liability report requires API mode.</p>;
  }

  return (
    <PayrollReportShell
      title="Payroll Liability"
      subtitle="Approved payroll minus payments made (Sprint 2 accrual model)."
      loading={q.isLoading}
      error={q.error ? (q.error as Error).message : null}
      companyName={tenant?.companyName ?? tenant?.name}
      onExportCsv={exportCsv}
      filters={<PeriodFilters month={month} year={year} onMonthChange={setMonth} onYearChange={setYear} />}
    >
      {totals && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl border border-app-border p-3">
            <p className="text-xs text-app-muted">Approved</p>
            <p className="text-lg font-bold">{formatReportCurrency(totals.approved_payroll)}</p>
          </div>
          <div className="rounded-xl border border-app-border p-3">
            <p className="text-xs text-app-muted">Paid</p>
            <p className="text-lg font-bold">{formatReportCurrency(totals.payments_made)}</p>
          </div>
          <div className="rounded-xl border border-app-border p-3">
            <p className="text-xs text-app-muted">Outstanding</p>
            <p className="text-lg font-bold text-amber-700">{formatReportCurrency(totals.outstanding_liability)}</p>
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-app-border">
        <table className="min-w-full text-sm">
          <thead className="bg-app-muted/10 text-[10px] uppercase text-app-muted">
            <tr>
              <th className="px-3 py-2 text-left">Period</th>
              <th className="px-3 py-2 text-right">Approved</th>
              <th className="px-3 py-2 text-right">Paid</th>
              <th className="px-3 py-2 text-right">Outstanding</th>
              <th className="px-3 py-2 text-right">Employees Left</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.payroll_period} className="border-t border-app-border">
                <td className="px-3 py-2 font-medium">{r.payroll_period}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatReportCurrency(r.approved_payroll)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatReportCurrency(r.payments_made)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatReportCurrency(r.outstanding_liability)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.employees_remaining}</td>
                <td className="px-3 py-2">{r.run_status}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-app-muted">No approved payroll runs for period.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </PayrollReportShell>
  );
};

export default PayrollLiabilityReport;
