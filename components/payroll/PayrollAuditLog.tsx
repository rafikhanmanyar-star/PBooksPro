import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, ShieldCheck, Clock, User, ChevronDown, ChevronUp } from 'lucide-react';
import { apiClient } from '../../services/api/client';
import { isAccountingBackedByRemoteApi } from '../../config/apiUrl';

type AuditRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  user_name?: string | null;
  module: string;
  entity_type: string;
  entity_id: string;
  action: string;
  audit_action: string | null;
  summary: string | null;
  old_value?: unknown;
  new_value?: unknown;
};

const ACTION_LABELS: Record<string, string> = {
  'payroll.run.approved': 'Run Approved',
  'payroll.run.unapproved': 'Run Unapproved',
  'payroll.summary.generated': 'Summaries Generated',
  'payroll.run.created': 'Run Created',
  'payroll.run.processed': 'Run Processed',
  'payroll.work_week.updated': 'Work Week Updated',
  'payroll.payslip.paid': 'Payslip Paid',
  'payroll.payslip.edited': 'Payslip Edited',
  'payroll.payslip.voided': 'Payslip Voided',
  'payroll.payslip.deleted': 'Payslip Deleted',
  'payroll.payslip.bulk_paid': 'Bulk Payment',
};

const ACTION_COLORS: Record<string, string> = {
  'payroll.run.approved': 'bg-ds-success/15 text-ds-success',
  'payroll.run.unapproved': 'bg-ds-warning/15 text-ds-warning',
  'payroll.summary.generated': 'bg-primary/15 text-primary',
  'payroll.run.processed': 'bg-violet-100 text-violet-700',
  'payroll.payslip.paid': 'bg-ds-success/15 text-ds-success',
  'payroll.payslip.voided': 'bg-red-100 text-red-600',
  'payroll.payslip.deleted': 'bg-red-100 text-red-600',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function DiffViewer({ label, value }: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  if (value == null || (typeof value === 'object' && Object.keys(value as object).length === 0)) return null;
  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-app-muted hover:text-app-text transition-colors font-medium"
      >
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        {label}
      </button>
      {open && (
        <pre className="mt-1 p-2 bg-app-toolbar/50 rounded-lg text-[10px] overflow-x-auto border border-app-border max-h-32 text-app-text">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

const PayrollAuditLog: React.FC = () => {
  const isApi = isAccountingBackedByRemoteApi();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('');

  const load = useCallback(async () => {
    if (!isApi) return;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ module: 'payroll', limit: '200' });
      if (actionFilter) q.set('action', actionFilter);
      const resp = await apiClient.get<{ items: AuditRow[] }>(`/audit/events?${q.toString()}`);
      setRows(resp?.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log.');
    } finally {
      setLoading(false);
    }
  }, [isApi, actionFilter]);

  useEffect(() => { void load(); }, [load]);

  if (!isApi) {
    return (
      <div className="p-6 text-center text-app-muted text-sm">
        Payroll audit log is available in server mode only.
      </div>
    );
  }

  const uniqueActions = [...new Set(rows.map(r => r.audit_action ?? r.action).filter(Boolean))].sort();

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-app-text">Payroll Audit Trail</h3>
          <p className="text-xs text-app-muted mt-0.5">All payroll events — who, when, what changed.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-app-border bg-app-card text-app-text outline-none"
            aria-label="Filter by action"
          >
            <option value="">All events</option>
            {uniqueActions.map(a => (
              <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="p-2 rounded-lg border border-app-border hover:bg-app-toolbar transition-colors text-app-muted disabled:opacity-50"
            aria-label="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={22} className="animate-spin text-app-muted" /></div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-app-muted">
          <ShieldCheck size={36} className="mb-3 opacity-30" />
          <p className="font-bold text-sm">No audit events found.</p>
          <p className="text-xs mt-1">Payroll events will appear here as actions are taken.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-app-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-app-toolbar/50 border-b border-app-border text-[10px] font-black text-app-muted uppercase tracking-widest">
                <th className="px-4 py-3 text-left">When</th>
                <th className="px-4 py-3 text-left">Event</th>
                <th className="px-4 py-3 text-left">Who</th>
                <th className="px-4 py-3 text-left">Entity</th>
                <th className="px-4 py-3 text-left">Summary</th>
                <th className="px-4 py-3 text-left">Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border">
              {rows.map(r => {
                const actionKey = r.audit_action ?? r.action;
                const label = ACTION_LABELS[actionKey] ?? actionKey;
                const colorCls = ACTION_COLORS[actionKey] ?? 'bg-app-toolbar text-app-muted';
                return (
                  <tr key={r.id} className="hover:bg-app-toolbar/30 transition-colors align-top">
                    <td className="px-4 py-3 text-xs text-app-muted whitespace-nowrap">
                      <span className="flex items-center gap-1"><Clock size={11} />{formatDateTime(r.created_at)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${colorCls}`}>
                        {label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-app-text">
                      <span className="flex items-center gap-1">
                        <User size={11} className="text-app-muted shrink-0" />
                        {r.user_name ?? r.user_id ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-app-muted font-mono">
                      {r.entity_type}
                      <span className="block text-[10px] opacity-70">{String(r.entity_id).slice(0, 12)}…</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-app-text max-w-[200px] truncate">
                      {r.summary ?? '—'}
                    </td>
                    <td className="px-4 py-3 space-y-1">
                      <DiffViewer label="Before" value={r.old_value} />
                      <DiffViewer label="After" value={r.new_value} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PayrollAuditLog;
