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
  employee_name: string;
  department?: string | null;
  leave_type: string;
  leave_days: number;
  lop_days: number;
  lop_impact: number;
  payroll_adjustment: number;
};

const LeaveImpactReport: React.FC = () => {
  const { tenant } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const isApi = isAccountingBackedByRemoteApi();

  const q = useQuery({
    queryKey: ['payroll-report', 'leave-impact', month, year],
    enabled: isApi,
    queryFn: async () => {
      const resp = await payrollReportsApi.getLeaveImpact({ month, year });
      return (resp?.rows ?? []) as Row[];
    },
  });

  const rows = q.data ?? [];

  const exportCsv = () => {
    downloadCsv(
      payrollReportFileName('leave-impact', { month, year }),
      rowsToCsv(
        [
          { header: 'Employee', value: (r) => r.employee_name },
          { header: 'Department', value: (r) => r.department ?? '' },
          { header: 'Leave Type', value: (r) => r.leave_type },
          { header: 'Leave Days', value: (r) => r.leave_days },
          { header: 'LOP Days', value: (r) => r.lop_days },
          { header: 'LOP Impact', value: (r) => r.lop_impact },
          { header: 'Payroll Adjustment', value: (r) => r.payroll_adjustment },
        ],
        rows
      )
    );
  };

  if (!isApi) {
    return <p className="text-sm text-app-muted p-4">Leave impact report requires API mode.</p>;
  }

  return (
    <PayrollReportShell
      title="Leave Impact"
      subtitle="Leave-driven payroll adjustments for HR verification."
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
              <th className="px-3 py-2 text-left">Employee</th>
              <th className="px-3 py-2 text-left">Department</th>
              <th className="px-3 py-2 text-left">Leave Type</th>
              <th className="px-3 py-2 text-right">Leave Days</th>
              <th className="px-3 py-2 text-right">LOP Days</th>
              <th className="px-3 py-2 text-right">LOP Impact</th>
              <th className="px-3 py-2 text-right">Adjustment</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.employee_name}-${i}`} className="border-t border-app-border">
                <td className="px-3 py-2 font-medium">{r.employee_name}</td>
                <td className="px-3 py-2">{r.department ?? '—'}</td>
                <td className="px-3 py-2">{r.leave_type}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.leave_days}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.lop_days}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatReportCurrency(r.lop_impact)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatReportCurrency(r.payroll_adjustment)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-app-muted">No leave impact for period.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </PayrollReportShell>
  );
};

export default LeaveImpactReport;
