import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { payrollAttendanceApi } from '../../../services/api/payrollAttendanceApi';

const AttendanceImpactReport: React.FC = () => {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const q = useQuery({
    queryKey: ['payroll', 'reports', 'attendance-impact', month, year],
    queryFn: () => payrollAttendanceApi.getAttendanceImpactReport(month, year),
  });

  const rows = q.data?.rows ?? [];

  return (
    <div className="space-y-4 p-4">
      <h3 className="text-lg font-bold">Attendance impact report</h3>
      <p className="text-sm text-app-muted">Informational only — no payslip changes.</p>
      <div className="flex gap-2">
        <input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-20 rounded border px-2 py-1 text-sm" />
        <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24 rounded border px-2 py-1 text-sm" />
      </div>
      <div className="overflow-x-auto rounded-xl border border-app-border">
        <table className="min-w-full text-sm">
          <thead className="bg-app-muted/10 text-xs uppercase text-app-muted">
            <tr>
              <th className="px-3 py-2 text-left">Employee</th>
              <th className="px-3 py-2 text-right">Present</th>
              <th className="px-3 py-2 text-right">Leave</th>
              <th className="px-3 py-2 text-right">Absent</th>
              <th className="px-3 py-2 text-right">LOP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-app-border">
                <td className="px-3 py-2">{r.employee_name ?? r.employee_id}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.present_days}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.leave_days}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.absent_days}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.lop_days}</td>
              </tr>
            ))}
            {rows.length === 0 && !q.isLoading && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-app-muted">Generate summaries in Payroll Wizard first.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AttendanceImpactReport;
