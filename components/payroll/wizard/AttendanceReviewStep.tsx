import React from 'react';
import type { PayrollAttendanceSummary } from '../../../services/api/payrollAttendanceApi';

type Props = {
  items: PayrollAttendanceSummary[];
  loading?: boolean;
};

const AttendanceReviewStep: React.FC<Props> = ({ items, loading }) => {
  if (loading) return <p className="text-sm text-app-muted">Loading attendance summary…</p>;
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-bold">Attendance review</h3>
      <p className="text-sm text-app-muted">Summaries from attendance records only (informational).</p>
      <div className="overflow-x-auto rounded-xl border border-app-border">
        <table className="min-w-full text-sm">
          <thead className="bg-app-muted/10 text-left text-xs uppercase text-app-muted">
            <tr>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2 text-right">Working</th>
              <th className="px-3 py-2 text-right">Present</th>
              <th className="px-3 py-2 text-right">Leave</th>
              <th className="px-3 py-2 text-right">Absent</th>
              <th className="px-3 py-2 text-right">Half</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.employee_id} className="border-t border-app-border">
                <td className="px-3 py-2">{r.employee_name ?? r.employee_id}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.working_days}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.present_days}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.leave_days}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.absent_days}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.half_days}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-app-muted">No employees in scope.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AttendanceReviewStep;
