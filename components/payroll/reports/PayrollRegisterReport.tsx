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
  employee_code?: string | null;
  employee_name: string;
  department?: string | null;
  designation?: string | null;
  payroll_period: string;
  basic_pay: number;
  total_allowances: number;
  overtime: number;
  gross_pay: number;
  total_deductions: number;
  leave_deductions: number;
  advance_recovery: number;
  net_pay: number;
  paid_amount: number;
  remaining_balance: number;
  status: string;
};

const PayrollRegisterReport: React.FC = () => {
  const { tenant } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [status, setStatus] = useState('');
  const isApi = isAccountingBackedByRemoteApi();

  const q = useQuery({
    queryKey: ['payroll-report', 'register', month, year, status],
    enabled: isApi,
    queryFn: async () => {
      const resp = await payrollReportsApi.getRegister({ month, year, status: status || undefined });
      return (resp?.rows ?? []) as Row[];
    },
  });

  const rows = q.data ?? [];

  const exportCsv = () => {
    const csv = rowsToCsv(
      [
        { header: 'Employee Code', value: (r) => r.employee_code ?? '' },
        { header: 'Employee Name', value: (r) => r.employee_name },
        { header: 'Department', value: (r) => r.department ?? '' },
        { header: 'Designation', value: (r) => r.designation ?? '' },
        { header: 'Payroll Period', value: (r) => r.payroll_period },
        { header: 'Basic Salary', value: (r) => r.basic_pay },
        { header: 'Allowances', value: (r) => r.total_allowances },
        { header: 'Overtime', value: (r) => r.overtime },
        { header: 'Gross Pay', value: (r) => r.gross_pay },
        { header: 'Deductions', value: (r) => r.total_deductions },
        { header: 'Leave Deductions', value: (r) => r.leave_deductions },
        { header: 'Advance Recovery', value: (r) => r.advance_recovery },
        { header: 'Net Salary', value: (r) => r.net_pay },
        { header: 'Paid Amount', value: (r) => r.paid_amount },
        { header: 'Remaining Balance', value: (r) => r.remaining_balance },
        { header: 'Status', value: (r) => r.status },
      ],
      rows
    );
    downloadCsv(payrollReportFileName('register', { month, year }), csv);
  };

  if (!isApi) {
    return <p className="text-sm text-app-muted p-4">Payroll register report requires API mode.</p>;
  }

  return (
    <PayrollReportShell
      title="Payroll Register"
      subtitle="Master payroll report for the selected period."
      loading={q.isLoading}
      error={q.error ? (q.error as Error).message : null}
      companyName={tenant?.companyName ?? tenant?.name}
      onExportCsv={exportCsv}
      filters={
        <PeriodFilters
          month={month}
          year={year}
          onMonthChange={setMonth}
          onYearChange={setYear}
          status={status}
          onStatusChange={setStatus}
          statusOptions={['Paid', 'Partial', 'Unpaid']}
        />
      }
    >
      <div className="overflow-x-auto rounded-xl border border-app-border">
        <table className="min-w-full text-sm">
          <thead className="bg-app-muted/10 text-[10px] uppercase text-app-muted">
            <tr>
              <th className="px-3 py-2 text-left">Employee</th>
              <th className="px-3 py-2 text-left">Dept</th>
              <th className="px-3 py-2 text-left">Period</th>
              <th className="px-3 py-2 text-right">Basic</th>
              <th className="px-3 py-2 text-right">Allow.</th>
              <th className="px-3 py-2 text-right">Gross</th>
              <th className="px-3 py-2 text-right">Ded.</th>
              <th className="px-3 py-2 text-right">LOP</th>
              <th className="px-3 py-2 text-right">Net</th>
              <th className="px-3 py-2 text-right">Paid</th>
              <th className="px-3 py-2 text-right">Remaining</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.employee_name}-${i}`} className="border-t border-app-border">
                <td className="px-3 py-2">
                  <div className="font-medium">{r.employee_name}</div>
                  <div className="text-xs text-app-muted">{r.employee_code ?? '—'}</div>
                </td>
                <td className="px-3 py-2 text-app-muted">{r.department ?? '—'}</td>
                <td className="px-3 py-2">{r.payroll_period}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatReportCurrency(r.basic_pay)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatReportCurrency(r.total_allowances)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatReportCurrency(r.gross_pay)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatReportCurrency(r.total_deductions)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatReportCurrency(r.leave_deductions)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatReportCurrency(r.net_pay)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatReportCurrency(r.paid_amount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatReportCurrency(r.remaining_balance)}</td>
                <td className="px-3 py-2 text-xs font-semibold">{r.status}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={12} className="px-3 py-8 text-center text-app-muted">No payslips for this period.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </PayrollReportShell>
  );
};

export default PayrollRegisterReport;
