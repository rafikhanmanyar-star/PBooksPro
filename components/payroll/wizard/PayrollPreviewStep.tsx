import React from 'react';
import { formatCurrency } from '../utils/formatters';
import type { PayrollImpactPreview } from '../../../services/api/payrollAttendanceApi';

type Props = {
  items: PayrollImpactPreview[];
  loading?: boolean;
};

const PayrollPreviewStep: React.FC<Props> = ({ items, loading }) => {
  if (loading) return <p className="text-sm text-app-muted">Loading projected impact…</p>;
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-bold">Payroll preview (projected only)</h3>
      <p className="text-sm text-app-muted">
        Shows projected LOP impact from current salary structures. Payslips are not modified in Sprint 3A.
      </p>
      <div className="overflow-x-auto rounded-xl border border-app-border">
        <table className="min-w-full text-sm">
          <thead className="bg-app-muted/10 text-left text-xs uppercase text-app-muted">
            <tr>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2 text-right">Current gross</th>
              <th className="px-3 py-2 text-right">LOP days</th>
              <th className="px-3 py-2 text-right">Projected impact</th>
              <th className="px-3 py-2 text-right">Projected net</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.employee_id} className="border-t border-app-border">
                <td className="px-3 py-2">{r.employee_name ?? r.employee_id}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.gross_pay)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.lop_days}</td>
                <td className="px-3 py-2 text-right tabular-nums text-amber-700">{formatCurrency(r.projected_deduction)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.projected_net_after_lop)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PayrollPreviewStep;
