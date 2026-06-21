import React, { useEffect, useMemo, useState } from 'react';
import { Users, CreditCard, Banknote, BarChart3 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { syncPayrollFromServer } from './services/payrollSync';
import { storageService } from './services/storageService';
import { formatCurrency } from './utils/formatters';
import { payslipRemainingAmount, payslipIsFullyPaid } from './utils/payslipPaymentState';

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
    return {
      employeeCount: active.length,
      runCount: runs.length,
      draftRuns: draftRuns.length,
      unpaidPayslips: unpaid.length,
      unpaidTotal,
    };
  }, [tenantId, revision]);

  const cards = [
    { label: 'Active employees', value: stats?.employeeCount ?? 0, icon: Users, color: 'text-blue-600' },
    { label: 'Payroll runs', value: stats?.runCount ?? 0, icon: CreditCard, color: 'text-violet-600' },
    { label: 'Draft runs', value: stats?.draftRuns ?? 0, icon: BarChart3, color: 'text-amber-600' },
    { label: 'Unpaid payslips', value: stats?.unpaidPayslips ?? 0, icon: Banknote, color: 'text-red-600' },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h2 className="text-xl font-black text-app-text">Payroll dashboard</h2>
        <p className="text-sm text-app-muted">Overview of workforce and payroll cycle status.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-2xl border border-app-border bg-app-card p-4 shadow-ds-card">
            <div className="flex items-center gap-2 text-app-muted mb-2">
              <Icon size={16} className={color} />
              <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
            </div>
            <p className={`text-2xl font-black tabular-nums ${color}`}>{value}</p>
          </div>
        ))}
      </div>
      {stats && stats.unpaidTotal > 0 && (
        <p className="text-sm text-app-muted">
          Outstanding payroll liability: <span className="font-semibold text-red-600">{formatCurrency(stats.unpaidTotal)}</span>
        </p>
      )}
    </div>
  );
};

export default PayrollDashboard;
