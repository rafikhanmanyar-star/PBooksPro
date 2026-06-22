import React, { useEffect, useMemo, useState } from 'react';
import {
  Users,
  CreditCard,
  Banknote,
  BarChart3,
  CheckCircle2,
  Clock,
  TrendingUp,
  CalendarCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { syncPayrollFromServer } from './services/payrollSync';
import { storageService } from './services/storageService';
import { formatCurrency } from './utils/formatters';
import { payslipRemainingAmount, payslipIsFullyPaid, payslipDisplayPaidAmount } from './utils/payslipPaymentState';

const MONTHS: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

const PayrollDashboard: React.FC = () => {
  const { tenant } = useAuth();
  const tenantId = tenant?.id ?? '';
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    void syncPayrollFromServer(tenantId).then(() => setRevision((r) => r + 1));
  }, [tenantId]);

  const stats = useMemo(() => {
    if (!tenantId) return null;
    storageService.init(tenantId);
    const employees = storageService.getEmployees(tenantId);
    const runs = storageService.getPayrollRuns(tenantId);
    const payslips = storageService.getPayslips(tenantId);

    const active = employees.filter((e) => e.status === 'ACTIVE' || !e.status);
    const unpaid = payslips.filter((p) => !payslipIsFullyPaid(p));
    const unpaidTotal = unpaid.reduce((s, p) => s + payslipRemainingAmount(p), 0);

    const draftRuns = runs.filter((r) => r.status === 'DRAFT');
    const generatedRuns = runs.filter((r) => r.status === 'GENERATED');
    const approvedRuns = runs.filter((r) => r.status === 'APPROVED');

    // Monthly cost: sum net_pay for payslips in the current calendar month's run(s)
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    const runsMap = new Map(runs.map((r) => [r.id, r]));
    const thisMonthPayslips = payslips.filter((ps) => {
      const run = runsMap.get(ps.payroll_run_id);
      if (!run) return false;
      const runMonth = typeof run.month === 'string' ? (MONTHS[run.month] ?? 0) : Number(run.month);
      return run.year === curYear && runMonth === curMonth;
    });
    const monthlyNetCost = thisMonthPayslips.reduce((s, p) => s + (Number(p.net_pay) || 0), 0);
    const monthlyGrossCost = thisMonthPayslips.reduce((s, p) => s + (Number(p.gross_pay) || 0), 0);

    // YTD cost: sum of all paid amounts this year
    const ytdPaid = payslips.reduce((s, ps) => {
      const run = runsMap.get(ps.payroll_run_id);
      if (!run || run.year !== curYear) return s;
      return s + payslipDisplayPaidAmount(ps);
    }, 0);

    // Total disbursed (all time)
    const totalDisbursed = payslips.reduce((s, ps) => s + payslipDisplayPaidAmount(ps), 0);

    return {
      employeeCount: active.length,
      runCount: runs.length,
      draftRuns: draftRuns.length,
      pendingApprovals: generatedRuns.length,
      approvedRuns: approvedRuns.length,
      unpaidPayslips: unpaid.length,
      unpaidTotal,
      monthlyNetCost,
      monthlyGrossCost,
      ytdPaid,
      totalDisbursed,
      hasCurrentMonthPayroll: thisMonthPayslips.length > 0,
    };
  }, [tenantId, revision]);

  const primaryCards = [
    {
      label: 'Active employees',
      value: stats?.employeeCount ?? 0,
      icon: Users,
      color: 'text-primary',
      bg: 'bg-primary/10',
      format: 'count' as const,
    },
    {
      label: 'Payroll runs',
      value: stats?.runCount ?? 0,
      icon: CreditCard,
      color: 'text-violet-600',
      bg: 'bg-violet-100',
      format: 'count' as const,
    },
    {
      label: 'Pending approval',
      value: stats?.pendingApprovals ?? 0,
      icon: Clock,
      color: 'text-amber-600',
      bg: 'bg-amber-100',
      format: 'count' as const,
    },
    {
      label: 'Approved runs',
      value: stats?.approvedRuns ?? 0,
      icon: CheckCircle2,
      color: 'text-ds-success',
      bg: 'bg-ds-success/10',
      format: 'count' as const,
    },
    {
      label: 'Unpaid payslips',
      value: stats?.unpaidPayslips ?? 0,
      icon: Banknote,
      color: 'text-red-600',
      bg: 'bg-red-100',
      format: 'count' as const,
    },
    {
      label: 'Payroll cost this month',
      value: stats?.monthlyNetCost ?? 0,
      icon: TrendingUp,
      color: 'text-ds-success',
      bg: 'bg-ds-success/10',
      format: 'currency' as const,
      sub: stats?.hasCurrentMonthPayroll ? `Gross PKR ${formatCurrency(stats?.monthlyGrossCost ?? 0)}` : 'No payroll run this month',
    },
    {
      label: 'Paid YTD',
      value: stats?.ytdPaid ?? 0,
      icon: BarChart3,
      color: 'text-primary',
      bg: 'bg-primary/10',
      format: 'currency' as const,
      sub: `${new Date().getFullYear()}`,
    },
    {
      label: 'Outstanding liability',
      value: stats?.unpaidTotal ?? 0,
      icon: CalendarCheck,
      color: 'text-ds-warning',
      bg: 'bg-ds-warning/10',
      format: 'currency' as const,
      sub: 'Unpaid payslip balances',
    },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 overflow-y-auto flex-1 min-h-0">
      <div>
        <h2 className="text-xl font-black text-app-text">Payroll dashboard</h2>
        <p className="text-sm text-app-muted">Overview of workforce, payroll cycle status, and financial position.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {primaryCards.map(({ label, value, icon: Icon, color, bg, format, sub }) => (
          <div key={label} className="rounded-2xl border border-app-border bg-app-card p-4 shadow-ds-card space-y-2">
            <div className="flex items-center gap-2 text-app-muted">
              <span className={`p-1.5 rounded-lg ${bg}`}>
                <Icon size={14} className={color} />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest leading-tight">{label}</span>
            </div>
            <p className={`text-2xl font-black tabular-nums ${color}`}>
              {format === 'currency'
                ? `PKR ${formatCurrency(value as number)}`
                : String(value)}
            </p>
            {sub && <p className="text-[10px] text-app-muted">{sub}</p>}
          </div>
        ))}
      </div>

      {/* Quick status indicators */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className={`rounded-xl p-4 border ${stats.pendingApprovals > 0 ? 'border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-700' : 'border-app-border bg-app-toolbar/30'}`}>
            <p className="text-xs font-black uppercase tracking-widest text-app-muted mb-1">Awaiting Approval</p>
            {stats.pendingApprovals > 0 ? (
              <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
                {stats.pendingApprovals} run{stats.pendingApprovals !== 1 ? 's' : ''} ready for approval — needs independent approver
              </p>
            ) : (
              <p className="text-sm text-app-muted">No runs pending approval.</p>
            )}
          </div>
          <div className={`rounded-xl p-4 border ${stats.approvedRuns > 0 ? 'border-ds-success/30 bg-ds-success/5' : 'border-app-border bg-app-toolbar/30'}`}>
            <p className="text-xs font-black uppercase tracking-widest text-app-muted mb-1">Ready to Pay</p>
            {stats.approvedRuns > 0 ? (
              <p className="text-sm font-bold text-ds-success">
                {stats.approvedRuns} approved run{stats.approvedRuns !== 1 ? 's' : ''} — salaries can be disbursed
              </p>
            ) : (
              <p className="text-sm text-app-muted">No approved runs outstanding.</p>
            )}
          </div>
          <div className={`rounded-xl p-4 border ${stats.unpaidTotal > 0 ? 'border-ds-warning/30 bg-ds-warning/5' : 'border-app-border bg-app-toolbar/30'}`}>
            <p className="text-xs font-black uppercase tracking-widest text-app-muted mb-1">Unpaid Liability</p>
            {stats.unpaidTotal > 0 ? (
              <p className="text-sm font-bold text-ds-warning">
                PKR {formatCurrency(stats.unpaidTotal)} outstanding across {stats.unpaidPayslips} payslip{stats.unpaidPayslips !== 1 ? 's' : ''}
              </p>
            ) : (
              <p className="text-sm text-app-muted">All payslips fully paid.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PayrollDashboard;
