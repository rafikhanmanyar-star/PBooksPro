import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { isAccountingBackedByRemoteApi } from '../../../config/apiUrl';
import payrollReportsApi from '../../../services/api/payrollReportsApi';
import PayrollReportShell, { PeriodFilters } from './PayrollReportShell';
import {
  downloadCsv,
  payrollReportFileName,
  rowsToCsv,
} from '../utils/payrollReportExport';

type Row = {
  employee_id: string;
  employee_name: string;
  department?: string | null;
  present_days: number;
  absent_days: number;
  leave_days: number;
  half_days: number;
  late_days: number;
  lop_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
};

const AttendanceImpactReport: React.FC = () => {
  const { tenant } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const isApi = isAccountingBackedByRemoteApi();

  const q = useQuery({
    queryKey: ['payroll', 'reports', 'attendance-impact-v2', month, year],
    enabled: isApi,
    queryFn: async () => {
      const resp = await payrollReportsApi.getAttendanceImpactV2(month, year);
      return (resp?.rows ?? []) as Row[];
    },
  });

  const rows = q.data ?? [];

  const exportCsv = () => {
    downloadCsv(
      payrollReportFileName('attendance-impact', { month, year }),
      rowsToCsv(
        [
          { header: 'Employee', value: (r) => r.employee_name },
          { header: 'Department', value: (r) => r.department ?? '' },
          { header: 'Present', value: (r) => r.present_days },
          { header: 'Absent', value: (r) => r.absent_days },
          { header: 'Leave', value: (r) => r.leave_days },
          { header: 'Half Day', value: (r) => r.half_days },
          { header: 'Late Arrival', value: (r) => r.late_days },
          { header: 'LOP Days', value: (r) => r.lop_days },
          { header: 'Paid Leave', value: (r) => r.paid_leave_days },
          { header: 'Unpaid Leave', value: (r) => r.unpaid_leave_days },
        ],
        rows
      )
    );
  };

  if (!isApi) {
    return <p className="text-sm text-app-muted p-4">Attendance impact report requires API mode.</p>;
  }

  return (
    <PayrollReportShell
      title="Attendance Impact"
      subtitle="Attendance summary driving payroll — present, leave, LOP."
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
              <th className="px-3 py-2 text-right">Present</th>
              <th className="px-3 py-2 text-right">Absent</th>
              <th className="px-3 py-2 text-right">Leave</th>
              <th className="px-3 py-2 text-right">Half Day</th>
              <th className="px-3 py-2 text-right">Late</th>
              <th className="px-3 py-2 text-right">LOP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee_id} className="border-t border-app-border">
                <td className="px-3 py-2">
                  <div className="font-medium">{r.employee_name}</div>
                  <div className="text-xs text-app-muted">{r.department ?? '—'}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.present_days}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.absent_days}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.leave_days}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.half_days}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.late_days}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.lop_days}</td>
              </tr>
            ))}
            {rows.length === 0 && !q.isLoading && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-app-muted">Generate summaries in Payroll Wizard first.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </PayrollReportShell>
  );
};

export default AttendanceImpactReport;
