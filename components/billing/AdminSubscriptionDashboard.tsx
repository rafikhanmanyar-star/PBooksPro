import React, { useCallback, useEffect, useState } from 'react';
import Button from '../ui/Button';
import {
  adminSubscriptionApi,
  type AdminSubscriptionRow,
  type AdminSubscriptionStats,
  type AdminWebhookDelivery,
} from '../../services/api/adminSubscriptionApi';

function statusBadge(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-100 text-emerald-800';
    case 'trialing':
      return 'bg-sky-100 text-sky-800';
    case 'past_due':
      return 'bg-amber-100 text-amber-900';
    case 'canceled':
    case 'expired':
      return 'bg-rose-100 text-rose-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const AdminSubscriptionDashboard: React.FC = () => {
  const [stats, setStats] = useState<AdminSubscriptionStats | null>(null);
  const [subscriptions, setSubscriptions] = useState<AdminSubscriptionRow[]>([]);
  const [webhooks, setWebhooks] = useState<AdminWebhookDelivery[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [maintenanceRunning, setMaintenanceRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, subsRes, hooksRes] = await Promise.all([
        adminSubscriptionApi.getStats(),
        adminSubscriptionApi.listSubscriptions({
          status: statusFilter || undefined,
          limit: 200,
        }),
        adminSubscriptionApi.listWebhooks({ status: 'failed', limit: 25 }),
      ]);
      setStats(statsRes);
      setSubscriptions(subsRes.items);
      setWebhooks(hooksRes.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load subscription data.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleMaintenance = async () => {
    setMaintenanceRunning(true);
    try {
      await adminSubscriptionApi.runMaintenance();
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Maintenance run failed.');
    } finally {
      setMaintenanceRunning(false);
    }
  };

  if (loading && !stats) {
    return <p className="text-slate-500 animate-pulse py-8 text-center">Loading subscription dashboard…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Subscription Administration</h2>
          <p className="text-sm text-slate-500">
            Cross-tenant Paddle billing overview. Grace period: {stats?.gracePeriodDays ?? 7} days.
          </p>
        </div>
        <Button onClick={() => void handleMaintenance()} disabled={maintenanceRunning}>
          {maintenanceRunning ? 'Running…' : 'Run maintenance'}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">{error}</p>
      )}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Tenants', value: stats.totalTenants },
            { label: 'Active', value: stats.activeSubscriptions },
            { label: 'Trialing', value: stats.trialing },
            { label: 'Past due', value: stats.pastDue },
            { label: 'Canceled', value: stats.canceled },
            { label: 'Expired', value: stats.expired },
            { label: 'Failed webhooks', value: stats.failedWebhooks },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
            >
              <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
              <p className="text-2xl font-semibold text-slate-800">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {['', 'active', 'trialing', 'past_due', 'canceled', 'expired'].map((s) => (
          <button
            key={s || 'all'}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === s
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {s ? s.replace('_', ' ') : 'All'}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          className="px-3 py-1.5 rounded-lg text-sm text-slate-600 border border-slate-200 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Tenant</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Cycle</th>
              <th className="px-4 py-3 font-medium">Renewal</th>
              <th className="px-4 py-3 font-medium">Grace ends</th>
              <th className="px-4 py-3 font-medium">Pending</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {subscriptions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No subscriptions match this filter.
                </td>
              </tr>
            ) : (
              subscriptions.map((row) => (
                <tr key={row.subscriptionId} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{row.tenantName}</div>
                    <div className="text-xs text-slate-500">{row.tenantId}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{row.planName}</div>
                    <div className="text-xs text-slate-500">{row.planCode}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(row.status)}`}>
                      {row.status}
                    </span>
                    {row.cancelAtPeriodEnd && (
                      <span className="block text-xs text-amber-700 mt-1">Cancel scheduled</span>
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize">{row.billingCycle}</td>
                  <td className="px-4 py-3">{formatDate(row.renewalDate ?? row.trialEndDate)}</td>
                  <td className="px-4 py-3">{formatDate(row.graceEndsAt)}</td>
                  <td className="px-4 py-3">{row.pendingPlanCode ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {webhooks.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Recent failed webhooks</h3>
          <div className="overflow-x-auto rounded-xl border border-rose-200 bg-rose-50/30">
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Event</th>
                  <th className="px-4 py-2 font-medium">Attempts</th>
                  <th className="px-4 py-2 font-medium">Error</th>
                  <th className="px-4 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-100">
                {webhooks.map((w) => (
                  <tr key={w.id}>
                    <td className="px-4 py-2 font-mono text-xs">{w.eventType}</td>
                    <td className="px-4 py-2">{w.attemptCount}</td>
                    <td className="px-4 py-2 text-rose-800 max-w-md truncate">{w.lastError ?? '—'}</td>
                    <td className="px-4 py-2">{formatDate(w.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSubscriptionDashboard;
