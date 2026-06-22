import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { isAccountingBackedByRemoteApi } from '../../../config/apiUrl';
import { payrollAttendanceApi } from '../../../services/api/payrollAttendanceApi';
import PayrollReportShell, { PeriodFilters } from './PayrollReportShell';
import {
  downloadCsv,
  payrollReportFileName,
  rowsToCsv,
} from '../utils/payrollReportExport';

const LOPReport: React.FC = () => {
  const { tenant } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const isApi = isAccountingBackedByRemoteApi();

  const q = useQuery({
    queryKey: ['payroll', 'reports', 'lop', month, year],
    enabled: isApi,
    queryFn: () => payrollAttendanceApi.getLopReport(month, year),
  });

  const rows = q.data?.rows ?? [];

  const exportCsv = () => {
    downloadCsv(
      payrollReportFileName('lop', { month, year }),
      rowsToCsv(
        [
          { header: 'Employee', value: (r) => r.employee_name ?? r.employee_id },
          { header: 'Department', value: (r) => r.department ?? '' },
          { header: 'Absent', value: (r) => r.absent_days },
          { header: 'Unpaid Leave', value: (r) => r.unpaid_leave_days },
          { header: 'Half Days', value: (r) => r.half_days },
          { header: 'LOP Days', value: (r) => r.lop_days },
        ],
        rows
      )
    );
  };

  if (!isApi) {
    return <p className="text-sm text-app-muted p-4">LOP report requires API mode.</p>;
  }

  return (
    <PayrollReportShell
      title="LOP Report"
      subtitle={`Loss-of-pay days by employee. Total LOP: ${q.data?.total_lop_days ?? 0}`}
      loading={q.isLoading}
      error={q.error ? (q.error as Error).message : null}
      companyName={tenant?.companyName ?? tenant?.name}
      onExportCsv={exportCsv}
      filters={<PeriodFilters month={month} year={year} onMonthChange={setMonth} onYearChange={setYear} />}
    >
      <div className="overflow-x-auto rounded-xl border border-app-border">
        <table className="min-w-full text-sm">
          <thead className="bg-app-muted/10 text-xs uppercase text-app-muted">
            <tr>
              <th className="px-3 py-2 text-left">Employee</th>
              <th className="px-3 py-2 text-left">Department</th>
              <th className="px-3 py-2 text-right">Absent</th>
              <th className="px-3 py-2 text-right">Unpaid leave</th>
              <th className="px-3 py-2 text-right">Half days</th>
              <th className="px-3 py-2 text-right">LOP days</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee_id} className="border-t border-app-border">
                <td className="px-3 py-2">{r.employee_name ?? r.employee_id}</td>
                <td className="px-3 py-2">{r.department ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.absent_days}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.unpaid_leave_days}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.half_days}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.lop_days}</td>
              </tr>
            ))}
            {rows.length === 0 && !q.isLoading && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-app-muted">No LOP rows for this period.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </PayrollReportShell>
  );
};

export default LOPReport;
