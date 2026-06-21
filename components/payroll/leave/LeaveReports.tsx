import React, { useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useLeaveBalances, useLeaveRequests, useLeaveTypes } from './hooks/useLeaveQueries';
import type { LeaveStatus } from '../../../services/api/leaveApi';

type ReportTab = 'balance' | 'history' | 'utilization' | 'department';

const LeaveReports: React.FC = () => {
  const now = new Date();
  const [tab, setTab] = useState<ReportTab>('balance');
  const [year, setYear] = useState(now.getFullYear());

  const { data: balanceData, isLoading: balLoading } = useLeaveBalances(year, undefined, tab === 'balance' || tab === 'utilization');
  const { data: historyData, isLoading: histLoading } = useLeaveRequests({ limit: 500 }, tab === 'history' || tab === 'department');
  const { data: types = [] } = useLeaveTypes();

  const balances = balanceData?.data ?? [];
  const history = historyData?.data ?? [];

  const utilization = useMemo(() => {
    const byType = new Map<string, { name: string; allocated: number; used: number }>();
    for (const t of types) byType.set(t.id, { name: t.name, allocated: 0, used: 0 });
    for (const b of balances) {
      const row = byType.get(b.leave_type_id);
      if (!row) continue;
      row.allocated += b.allocated_days;
      row.used += b.used_days;
    }
    return Array.from(byType.values());
  }, [balances, types]);

  const byDepartment = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of history.filter((h) => h.status === 'APPROVED')) {
      const dept = r.department ?? 'Unknown';
      map.set(dept, (map.get(dept) ?? 0) + r.days);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [history]);

  const exportCsv = (filename: string, headers: string[], rows: string[][]) => {
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    if (tab === 'balance') {
      exportCsv(
        `leave_balance_${year}.csv`,
        ['Employee', 'Department', 'Leave type', 'Allocated', 'Used', 'Balance'],
        balances.map((b) => [
          b.employee_name ?? b.employee_id,
          b.department ?? '',
          b.leave_type_name ?? b.leave_type_id,
          String(b.allocated_days),
          String(b.used_days),
          String(b.balance_days),
        ])
      );
    } else if (tab === 'history') {
      exportCsv(
        'leave_history.csv',
        ['Employee', 'Department', 'Type', 'From', 'To', 'Days', 'Status'],
        history.map((r) => [
          r.employee_name ?? r.employee_id,
          r.department ?? '',
          r.leave_type_name ?? '',
          r.from_date,
          r.to_date,
          String(r.days),
          r.status,
        ])
      );
    } else if (tab === 'utilization') {
      exportCsv(
        `leave_utilization_${year}.csv`,
        ['Leave type', 'Allocated', 'Used', 'Utilization %'],
        utilization.map((u) => [
          u.name,
          String(u.allocated),
          String(u.used),
          u.allocated > 0 ? String(Math.round((u.used / u.allocated) * 100)) : '0',
        ])
      );
    } else {
      exportCsv(
        'department_leave.csv',
        ['Department', 'Approved leave days'],
        byDepartment.map(([d, days]) => [d, String(days)])
      );
    }
  };

  const loading = balLoading || histLoading;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {(['balance', 'history', 'utilization', 'department'] as ReportTab[]).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`px-3 py-2 rounded-xl text-sm font-semibold capitalize ${tab === t ? 'bg-primary text-white' : 'border border-app-border'}`}>
            {t === 'department' ? 'By department' : `${t} report`}
          </button>
        ))}
        <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24 rounded-xl border border-app-border px-2 py-2 text-sm" />
        <button type="button" onClick={handleExport} className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-app-border text-sm font-semibold">
          <Download size={16} /> Export CSV
        </button>
        {loading && <Loader2 size={18} className="animate-spin" />}
      </div>
      <div className="rounded-2xl border border-app-border bg-app-card overflow-x-auto p-4 text-sm">
        {tab === 'balance' && (
          <table className="w-full">
            <thead><tr className="text-xs uppercase text-app-muted"><th className="text-left py-1">Employee</th><th className="text-left">Type</th><th className="text-right">Used</th><th className="text-right">Balance</th></tr></thead>
            <tbody>{balances.map((b) => (
              <tr key={b.id} className="border-t border-app-border/40"><td className="py-1">{b.employee_name}</td><td>{b.leave_type_name}</td><td className="text-right tabular-nums">{b.used_days}</td><td className="text-right tabular-nums">{b.balance_days}</td></tr>
            ))}</tbody>
          </table>
        )}
        {tab === 'history' && (
          <table className="w-full">
            <thead><tr className="text-xs uppercase text-app-muted"><th className="text-left py-1">Employee</th><th className="text-left">Type</th><th className="text-left">Dates</th><th className="text-left">Status</th></tr></thead>
            <tbody>{history.map((r) => (
              <tr key={r.id} className="border-t border-app-border/40"><td className="py-1">{r.employee_name}</td><td>{r.leave_type_name}</td><td>{r.from_date} → {r.to_date}</td><td>{r.status as LeaveStatus}</td></tr>
            ))}</tbody>
          </table>
        )}
        {tab === 'utilization' && (
          <table className="w-full">
            <thead><tr className="text-xs uppercase text-app-muted"><th className="text-left py-1">Type</th><th className="text-right">Allocated</th><th className="text-right">Used</th><th className="text-right">%</th></tr></thead>
            <tbody>{utilization.map((u) => (
              <tr key={u.name} className="border-t border-app-border/40"><td className="py-1">{u.name}</td><td className="text-right tabular-nums">{u.allocated}</td><td className="text-right tabular-nums">{u.used}</td><td className="text-right tabular-nums">{u.allocated > 0 ? Math.round((u.used / u.allocated) * 100) : 0}%</td></tr>
            ))}</tbody>
          </table>
        )}
        {tab === 'department' && (
          <table className="w-full">
            <thead><tr className="text-xs uppercase text-app-muted"><th className="text-left py-1">Department</th><th className="text-right">Approved days</th></tr></thead>
            <tbody>{byDepartment.map(([d, days]) => (
              <tr key={d} className="border-t border-app-border/40"><td className="py-1">{d}</td><td className="text-right tabular-nums">{days}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default LeaveReports;
