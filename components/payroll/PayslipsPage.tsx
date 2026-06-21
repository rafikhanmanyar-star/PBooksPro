import React, { useEffect, useMemo, useState } from 'react';
import { storageService } from './services/storageService';
import { syncPayrollFromServer } from './services/payrollSync';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from './utils/formatters';
import { payslipDisplayPaidAmount, payslipIsFullyPaid, payslipRemainingAmount } from './utils/payslipPaymentState';
import type { Payslip, PayrollRun } from './types';

const PayslipsPage: React.FC = () => {
  const { tenant } = useAuth();
  const tenantId = tenant?.id ?? '';
  const [revision, setRevision] = useState(0);
  const [yearFilter, setYearFilter] = useState<string>('');

  useEffect(() => {
    if (!tenantId) return;
    void syncPayrollFromServer(tenantId).then(() => setRevision((r) => r + 1));
  }, [tenantId]);

  const { payslips, runsById } = useMemo(() => {
    if (!tenantId) return { payslips: [] as Payslip[], runsById: new Map<string, PayrollRun>() };
    storageService.init(tenantId);
    const runs = storageService.getPayrollRuns(tenantId);
    const map = new Map(runs.map((r) => [r.id, r]));
    const slips = storageService.getPayslips(tenantId).sort((a, b) => {
      const ra = map.get(a.payroll_run_id);
      const rb = map.get(b.payroll_run_id);
      const ya = ra?.year ?? 0;
      const yb = rb?.year ?? 0;
      if (ya !== yb) return yb - ya;
      return String(rb?.month ?? '').localeCompare(String(ra?.month ?? ''));
    });
    return { payslips: slips, runsById: map };
  }, [tenantId, revision]);

  const years = useMemo(() => {
    const ys = new Set<number>();
    for (const r of runsById.values()) ys.add(r.year);
    return Array.from(ys).sort((a, b) => b - a);
  }, [runsById]);

  const filtered = useMemo(() => {
    if (!yearFilter) return payslips;
    const y = Number(yearFilter);
    return payslips.filter((p) => runsById.get(p.payroll_run_id)?.year === y);
  }, [payslips, runsById, yearFilter]);

  const employees = useMemo(() => {
    if (!tenantId) return new Map<string, string>();
    return new Map(storageService.getEmployees(tenantId).map((e) => [e.id, e.name]));
  }, [tenantId, revision]);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-app-text">Payslips</h2>
          <p className="text-sm text-app-muted">All generated payslips across payroll runs.</p>
        </div>
        <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="rounded-xl border border-app-border px-3 py-2 text-sm">
          <option value="">All years</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
      </div>
      <div className="rounded-2xl border border-app-border overflow-hidden bg-app-card">
        <table className="w-full text-sm">
          <thead className="bg-app-muted/10 text-xs uppercase text-app-muted">
            <tr>
              <th className="px-4 py-3 text-left">Period</th>
              <th className="px-4 py-3 text-left">Employee</th>
              <th className="px-4 py-3 text-right">Net pay</th>
              <th className="px-4 py-3 text-right">Paid</th>
              <th className="px-4 py-3 text-right">Remaining</th>
              <th className="px-4 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-app-muted">No payslips found.</td></tr>
            ) : (
              filtered.map((p) => {
                const run = runsById.get(p.payroll_run_id);
                const paid = payslipIsFullyPaid(p);
                return (
                  <tr key={p.id} className="border-t border-app-border/50">
                    <td className="px-4 py-3">{run ? `${run.month} ${run.year}` : '—'}</td>
                    <td className="px-4 py-3 font-medium">{employees.get(p.employee_id) ?? p.employee_id}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(p.net_pay)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(payslipDisplayPaidAmount(p))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(payslipRemainingAmount(p))}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold ${paid ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {paid ? 'Paid' : 'Unpaid'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PayslipsPage;
