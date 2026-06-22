import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { isAccountingBackedByRemoteApi } from '../../../config/apiUrl';
import payrollReportsApi from '../../../services/api/payrollReportsApi';
import PayrollReportShell, { PeriodFilters } from './PayrollReportShell';
import {
  downloadCsv,
  formatReportCurrency,
  formatReportDate,
  payrollReportFileName,
  rowsToCsv,
} from '../utils/payrollReportExport';

type Row = {
  payroll_period: string;
  approval_date?: string | null;
  journal_entry_id?: string | null;
  journal_reference?: string | null;
  journal_reversed: boolean;
  expense_amount: number;
  liability_amount: number;
  payments_settled: number;
  remaining_liability: number;
  run_status: string;
};

const PayrollJournalReport: React.FC = () => {
  const { tenant } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const isApi = isAccountingBackedByRemoteApi();

  const q = useQuery({
    queryKey: ['payroll-report', 'journal', month, year],
    enabled: isApi,
    queryFn: async () => {
      const resp = await payrollReportsApi.getJournal({ month, year });
      return (resp?.rows ?? []) as Row[];
    },
  });

  const rows = q.data ?? [];

  const exportCsv = () => {
    downloadCsv(
      payrollReportFileName('journal', { month, year }),
      rowsToCsv(
        [
          { header: 'Payroll Period', value: (r) => r.payroll_period },
          { header: 'Approval Date', value: (r) => formatReportDate(r.approval_date) },
          { header: 'Journal Entry', value: (r) => r.journal_entry_id ?? '' },
          { header: 'Reference', value: (r) => r.journal_reference ?? '' },
          { header: 'Reversed', value: (r) => (r.journal_reversed ? 'Yes' : 'No') },
          { header: 'Expense Amount', value: (r) => r.expense_amount },
          { header: 'Liability Amount', value: (r) => r.liability_amount },
          { header: 'Payments Settled', value: (r) => r.payments_settled },
          { header: 'Remaining Liability', value: (r) => r.remaining_liability },
          { header: 'Run Status', value: (r) => r.run_status },
        ],
        rows
      )
    );
  };

  if (!isApi) {
    return <p className="text-sm text-app-muted p-4">Journal report requires API mode.</p>;
  }

  return (
    <PayrollReportShell
      title="Payroll Journal"
      subtitle="Accrual and settlement verification (Sprint 2 accounting)."
      loading={q.isLoading}
      error={q.error ? (q.error as Error).message : null}
      companyName={tenant?.companyName ?? tenant?.name}
      onExportCsv={exportCsv}
      filters={<PeriodFilters month={month} year={year} onMonthChange={setMonth} onYearChange={setYear} />}
    >
      <div className="overflow-x-auto rounded-xl border border-app-border">
        <table className="min-w-full text-sm">
          <thead className="bg-app-muted/10 text-[10px] uppercase text-app-muted">
            <tr>
              <th className="px-3 py-2 text-left">Period</th>
              <th className="px-3 py-2 text-left">Approved</th>
              <th className="px-3 py-2 text-left">Journal</th>
              <th className="px-3 py-2 text-right">Expense</th>
              <th className="px-3 py-2 text-right">Liability</th>
              <th className="px-3 py-2 text-right">Settled</th>
              <th className="px-3 py-2 text-right">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.payroll_period}-${r.journal_entry_id}`} className="border-t border-app-border">
                <td className="px-3 py-2 font-medium">{r.payroll_period}</td>
                <td className="px-3 py-2">{formatReportDate(r.approval_date)}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {r.journal_entry_id ?? '—'}
                  {r.journal_reversed && <span className="text-amber-600 ml-1">(reversed)</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatReportCurrency(r.expense_amount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatReportCurrency(r.liability_amount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatReportCurrency(r.payments_settled)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatReportCurrency(r.remaining_liability)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-app-muted">No payroll journal data.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </PayrollReportShell>
  );
};

export default PayrollJournalReport;
