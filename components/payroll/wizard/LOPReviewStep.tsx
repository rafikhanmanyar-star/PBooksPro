import React from 'react';
import type { PayrollAttendanceSummary } from '../../../services/api/payrollAttendanceApi';

type Props = {
  items: PayrollAttendanceSummary[];
  loading?: boolean;
};

const LOPReviewStep: React.FC<Props> = ({ items, loading }) => {
  if (loading) return <p className="text-sm text-app-muted">Calculating LOP days…</p>;
  const totalLop = items.reduce((s, r) => s + r.lop_days, 0);
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-bold">LOP review</h3>
      <p className="text-sm text-app-muted">
        LOP = Absent + Unpaid leave + (Half days × 0.5). No salary deduction in Sprint 3A.
      </p>
      <p className="text-sm font-semibold">Total LOP days: <span className="tabular-nums">{totalLop}</span></p>
      <div className="overflow-x-auto rounded-xl border border-app-border">
        <table className="min-w-full text-sm">
          <thead className="bg-app-muted/10 text-left text-xs uppercase text-app-muted">
            <tr>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2 text-right">Paid leave</th>
              <th className="px-3 py-2 text-right">Unpaid leave</th>
              <th className="px-3 py-2 text-right">LOP days</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.employee_id} className="border-t border-app-border">
                <td className="px-3 py-2">{r.employee_name ?? r.employee_id}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.paid_leave_days}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.unpaid_leave_days}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-amber-700">{r.lop_days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LOPReviewStep;
