import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { payrollAttendanceApi } from '../../../services/api/payrollAttendanceApi';

const LOPReport: React.FC = () => {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const q = useQuery({
    queryKey: ['payroll', 'reports', 'lop', month, year],
    queryFn: () => payrollAttendanceApi.getLopReport(month, year),
  });

  const rows = q.data?.rows ?? [];

  return (
    <div className="space-y-4 p-4">
      <h3 className="text-lg font-bold">LOP report</h3>
      <p className="text-sm text-app-muted">
        Loss-of-pay days by employee. Total LOP: <strong>{q.data?.total_lop_days ?? 0}</strong>
      </p>
      <div className="flex gap-2">
        <input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-20 rounded border px-2 py-1 text-sm" />
        <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24 rounded border px-2 py-1 text-sm" />
      </div>
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
    </div>
  );
};

export default LOPReport;
