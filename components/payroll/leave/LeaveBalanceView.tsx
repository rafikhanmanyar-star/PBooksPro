import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useLeaveBalances, useLeaveTypes } from './hooks/useLeaveQueries';
import { payrollApi } from '../../../services/api/payrollApi';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';

const LeaveBalanceView: React.FC = () => {
  const { tenant } = useAuth();
  const tenantId = tenant?.id ?? '';
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [departmentId, setDepartmentId] = useState('');
  const { data, isLoading } = useLeaveBalances(year, departmentId || undefined);
  const { data: types = [] } = useLeaveTypes();

  const { data: departments = [] } = useQuery({
    queryKey: ['payroll', 'departments', tenantId],
    queryFn: () => payrollApi.getDepartments(),
    enabled: !!tenantId,
  });

  const rows = data?.data ?? [];

  const byEmployee = useMemo(() => {
    const map = new Map<string, { name: string; department: string; byType: Record<string, { used: number; balance: number }> }>();
    for (const b of rows) {
      if (!map.has(b.employee_id)) {
        map.set(b.employee_id, {
          name: b.employee_name ?? b.employee_id,
          department: b.department ?? '',
          byType: {},
        });
      }
      const row = map.get(b.employee_id)!;
      row.byType[b.leave_type_id] = { used: b.used_days, balance: b.balance_days };
    }
    return Array.from(map.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [rows]);

  const paidTypes = types.filter((t) => t.active && t.paid_leave);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-app-muted mb-1">Year</label>
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24 rounded-xl border border-app-border px-3 py-2 text-sm" />
        </div>
        <div className="min-w-[160px]">
          <label className="block text-xs font-semibold text-app-muted mb-1">Department</label>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="w-full rounded-xl border border-app-border px-3 py-2 text-sm">
            <option value="">All</option>
            {departments.map((d: { id: string; name: string }) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        {isLoading && <Loader2 size={18} className="animate-spin mb-2" />}
      </div>
      <div className="rounded-2xl border border-app-border overflow-x-auto bg-app-card">
        <table className="w-full text-sm min-w-max">
          <thead className="bg-app-muted/10 text-xs uppercase text-app-muted">
            <tr>
              <th className="px-4 py-2 text-left">Employee</th>
              <th className="px-4 py-2 text-left">Department</th>
              {paidTypes.map((t) => (
                <th key={t.id} colSpan={2} className="px-4 py-2 text-center border-l border-app-border/40">{t.name}</th>
              ))}
            </tr>
            <tr className="text-[10px]">
              <th colSpan={2} />
              {paidTypes.map((t) => (
                <React.Fragment key={`${t.id}-sub`}>
                  <th className="px-2 py-1 text-center border-l border-app-border/40">Used</th>
                  <th className="px-2 py-1 text-center">Left</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {byEmployee.map(([empId, emp]) => (
              <tr key={empId} className="border-t border-app-border/50">
                <td className="px-4 py-2 font-medium">{emp.name}</td>
                <td className="px-4 py-2 text-app-muted">{emp.department}</td>
                {paidTypes.map((t) => {
                  const cell = emp.byType[t.id] ?? { used: 0, balance: t.annual_quota };
                  return (
                    <React.Fragment key={`${empId}-${t.id}`}>
                      <td className="px-2 py-2 text-center tabular-nums border-l border-app-border/40">{cell.used}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{cell.balance}</td>
                    </React.Fragment>
                  );
                })}
              </tr>
            ))}
            {byEmployee.length === 0 && !isLoading && (
              <tr><td colSpan={2 + paidTypes.length * 2} className="px-4 py-8 text-center text-app-muted">No balance records.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LeaveBalanceView;
