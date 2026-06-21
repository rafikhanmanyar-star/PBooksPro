import React, { useCallback, useEffect, useState } from 'react';
import {
  subscriptionsApi,
  type AdminSubscriptionStats,
  type AdminSubscriptionRow,
  type AdminWebhookDelivery,
} from '../../services/platformAdminApi';
import {
  Button,
  Card,
  ErrorBanner,
  MetricCard,
  MetricGrid,
  PageHeader,
  StatusBadge,
  colors,
  tableStyles,
} from '../shared/platformUi';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const STATUS_FILTERS = ['', 'active', 'trialing', 'past_due', 'canceled', 'expired'];

const SubscriptionDashboard: React.FC = () => {
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
        subscriptionsApi.getStats(),
        subscriptionsApi.listSubscriptions({ status: statusFilter || undefined, limit: 200 }),
        subscriptionsApi.listWebhooks({ status: 'failed', limit: 25 }),
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
      await subscriptionsApi.runMaintenance();
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Maintenance run failed.');
    } finally {
      setMaintenanceRunning(false);
    }
  };

  if (loading && !stats) {
    return <p style={{ color: colors.muted, textAlign: 'center', padding: '2rem' }}>Loading subscription dashboard…</p>;
  }

  return (
    <div>
      <PageHeader
        title="Subscription Administration"
        subtitle={`Cross-tenant Paddle billing overview. Grace period: ${stats?.gracePeriodDays ?? 7} days.`}
        action={
          <Button onClick={() => void handleMaintenance()} disabled={maintenanceRunning}>
            {maintenanceRunning ? 'Running…' : 'Run maintenance'}
          </Button>
        }
      />

      {error && <ErrorBanner message={error} />}

      {stats && (
        <div style={{ marginBottom: '1.5rem' }}>
          <MetricGrid>
            <MetricCard label="Tenants" value={stats.totalTenants} />
            <MetricCard label="Active" value={stats.activeSubscriptions} />
            <MetricCard label="Trialing" value={stats.trialing} />
            <MetricCard label="Past due" value={stats.pastDue} />
            <MetricCard label="Canceled" value={stats.canceled} />
            <MetricCard label="Expired" value={stats.expired} />
            <MetricCard label="Failed webhooks" value={stats.failedWebhooks} />
          </MetricGrid>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        {STATUS_FILTERS.map((s) => (
          <Button
            key={s || 'all'}
            variant={statusFilter === s ? 'primary' : 'secondary'}
            onClick={() => setStatusFilter(s)}
          >
            {s ? s.replace('_', ' ') : 'All'}
          </Button>
        ))}
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <Card style={{ padding: 0, overflow: 'auto', marginBottom: '1.5rem' }}>
        <table style={tableStyles.table}>
          <thead>
            <tr>
              {['Tenant', 'Plan', 'Status', 'Cycle', 'Renewal', 'Grace ends', 'Pending'].map((h) => (
                <th key={h} style={tableStyles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subscriptions.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ ...tableStyles.td, textAlign: 'center', color: colors.muted, padding: '2rem' }}>
                  No subscriptions match this filter.
                </td>
              </tr>
            ) : (
              subscriptions.map((row) => (
                <tr key={row.subscriptionId}>
                  <td style={tableStyles.td}>
                    <div style={{ fontWeight: 600 }}>{row.tenantName}</div>
                    <div style={{ fontSize: '0.75rem', color: colors.muted }}>{row.tenantId}</div>
                  </td>
                  <td style={tableStyles.td}>
                    <div>{row.planName}</div>
                    <div style={{ fontSize: '0.75rem', color: colors.muted }}>{row.planCode}</div>
                  </td>
                  <td style={tableStyles.td}>
                    <StatusBadge status={row.status} />
                    {row.cancelAtPeriodEnd && (
                      <span style={{ display: 'block', fontSize: '0.75rem', color: colors.warn, marginTop: '0.25rem' }}>
                        Cancel scheduled
                      </span>
                    )}
                  </td>
                  <td style={{ ...tableStyles.td, textTransform: 'capitalize' }}>{row.billingCycle}</td>
                  <td style={tableStyles.td}>{formatDate(row.renewalDate ?? row.trialEndDate)}</td>
                  <td style={tableStyles.td}>{formatDate(row.graceEndsAt)}</td>
                  <td style={tableStyles.td}>{row.pendingPlanCode ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {webhooks.length > 0 && (
        <div>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: colors.text, marginBottom: '0.5rem' }}>
            Recent failed webhooks
          </h3>
          <Card style={{ padding: 0, overflow: 'auto', borderColor: '#fecaca' }}>
            <table style={tableStyles.table}>
              <thead>
                <tr>
                  {['Event', 'Attempts', 'Error', 'When'].map((h) => (
                    <th key={h} style={tableStyles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {webhooks.map((w) => (
                  <tr key={w.id}>
                    <td style={{ ...tableStyles.td, fontFamily: 'monospace', fontSize: '0.75rem' }}>{w.eventType}</td>
                    <td style={tableStyles.td}>{w.attemptCount}</td>
                    <td style={{ ...tableStyles.td, color: colors.danger, maxWidth: '24rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {w.lastError ?? '—'}
                    </td>
                    <td style={tableStyles.td}>{formatDate(w.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
};

export default SubscriptionDashboard;
