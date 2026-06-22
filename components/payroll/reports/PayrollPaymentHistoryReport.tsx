import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { isAccountingBackedByRemoteApi } from '../../../config/apiUrl';
import payrollReportsApi from '../../../services/api/payrollReportsApi';
import PayrollReportShell from './PayrollReportShell';
import {
  downloadCsv,
  formatReportCurrency,
  formatReportDate,
  payrollReportFileName,
  rowsToCsv,
} from '../utils/payrollReportExport';

type Row = {
  employee_name: string;
  department?: string | null;
  payment_date: string;
  reference_number: string;
  payment_method: string;
  amount: number;
  created_by?: string | null;
  payroll_period: string;
  status: string;
};

const PayrollPaymentHistoryReport: React.FC = () => {
  const { tenant } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const isApi = isAccountingBackedByRemoteApi();

  const q = useQuery({
    queryKey: ['payroll-report', 'payment-history', month, year],
    enabled: isApi,
    queryFn: async () => {
      const resp = await payrollReportsApi.getPaymentHistory({ month, year });
      return (resp?.rows ?? []) as Row[];
    },
  });

  const rows = q.data ?? [];

  const exportCsv = () => {
    downloadCsv(
      payrollReportFileName('payment-history', { month, year }),
      rowsToCsv(
        [
          { header: 'Employee', value: (r) => r.employee_name },
          { header: 'Department', value: (r) => r.department ?? '' },
          { header: 'Payment Date', value: (r) => formatReportDate(r.payment_date) },
          { header: 'Reference Number', value: (r) => r.reference_number },
          { header: 'Payment Method', value: (r) => r.payment_method },
          { header: 'Amount', value: (r) => r.amount },
          { header: 'Payroll Period', value: (r) => r.payroll_period },
          { header: 'Created By', value: (r) => r.created_by ?? '' },
          { header: 'Status', value: (r) => r.status },
        ],
        rows
      )
    );
  };

  if (!isApi) {
    return <p className="text-sm text-app-muted p-4">Payment history report requires API mode.</p>;
  }

  return (
    <PayrollReportShell
      title="Payroll Payment History"
      subtitle="All payroll settlement transactions."
      loading={q.isLoading}
      error={q.error ? (q.error as Error).message : null}
      companyName={tenant?.companyName ?? tenant?.name}
      onExportCsv={exportCsv}
      filters={
        <div className="flex gap-2">
          <input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-16 rounded-lg border px-2 py-1 text-sm" />
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-20 rounded-lg border px-2 py-1 text-sm" />
        </div>
      }
    >
      <div className="overflow-x-auto rounded-xl border border-app-border">
        <table className="min-w-full text-sm">
          <thead className="bg-app-muted/10 text-[10px] uppercase text-app-muted">
            <tr>
              <th className="px-3 py-2 text-left">Employee</th>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Reference</th>
              <th className="px-3 py-2 text-left">Method</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-left">Period</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.reference_number} className="border-t border-app-border">
                <td className="px-3 py-2 font-medium">{r.employee_name}</td>
                <td className="px-3 py-2">{formatReportDate(r.payment_date)}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.reference_number}</td>
                <td className="px-3 py-2">{r.payment_method}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatReportCurrency(r.amount)}</td>
                <td className="px-3 py-2">{r.payroll_period}</td>
                <td className="px-3 py-2">{r.status}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-app-muted">No payments in range.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </PayrollReportShell>
  );
};

export default PayrollPaymentHistoryReport;
