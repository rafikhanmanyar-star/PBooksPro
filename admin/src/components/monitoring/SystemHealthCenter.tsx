import React, { useCallback, useEffect, useState } from 'react';
import {
  monitoringApi,
  type HealthCenterSnapshot,
  type ApiEndpointStat,
  type MonitoringEvent,
  type MonitoringOverview,
} from '../../services/platformAdminApi';
import {
  Button,
  Card,
  ErrorBanner,
  MetricCard,
  MetricGrid,
  PageHeader,
  StatusBadge,
  Tabs,
  colors,
  tableStyles,
} from '../shared/platformUi';

type TabId = 'health' | 'api' | 'database' | 'sync' | 'audit' | 'events';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function ApiTable({ endpoints, thresholds }: { endpoints: ApiEndpointStat[]; thresholds: { warnMs: number; criticalMs: number } }) {
  if (endpoints.length === 0) {
    return <p style={{ color: colors.muted, textAlign: 'center', padding: '1.5rem' }}>No API traffic recorded in this window.</p>;
  }
  return (
    <Card style={{ padding: 0, overflow: 'auto' }}>
      <table style={tableStyles.table}>
        <thead>
          <tr>
            {['Method', 'Path', 'Requests', 'Errors', 'Avg', 'P95', 'P99', 'Warn+'].map((h) => (
              <th key={h} style={tableStyles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {endpoints.map((ep) => {
            const slow = ep.p95Ms >= thresholds.criticalMs;
            const warn = !slow && ep.p95Ms >= thresholds.warnMs;
            return (
              <tr key={ep.routeKey}>
                <td style={{ ...tableStyles.td, fontFamily: 'monospace', fontSize: '0.75rem' }}>{ep.method}</td>
                <td style={{ ...tableStyles.td, fontFamily: 'monospace', fontSize: '0.75rem', maxWidth: '18rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ep.path}>{ep.path}</td>
                <td style={{ ...tableStyles.td, textAlign: 'right' }}>{ep.requestCount}</td>
                <td style={{ ...tableStyles.td, textAlign: 'right', color: colors.danger }}>{ep.errorCount}</td>
                <td style={{ ...tableStyles.td, textAlign: 'right' }}>{Math.round(ep.avgMs)}ms</td>
                <td style={{ ...tableStyles.td, textAlign: 'right', fontWeight: 600, color: slow ? colors.danger : warn ? colors.warn : colors.text }}>{Math.round(ep.p95Ms)}ms</td>
                <td style={{ ...tableStyles.td, textAlign: 'right' }}>{Math.round(ep.p99Ms)}ms</td>
                <td style={{ ...tableStyles.td, textAlign: 'right', color: colors.warn }}>{ep.warningBreaches + ep.criticalBreaches}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ fontSize: '0.75rem', color: colors.muted, padding: '0.5rem 0.75rem', borderTop: `1px solid ${colors.border}` }}>
        Thresholds: warning &gt;{thresholds.warnMs}ms · critical &gt;{thresholds.criticalMs}ms (p95)
      </p>
    </Card>
  );
}

function EventsTab() {
  const [overview, setOverview] = useState<MonitoringOverview | null>(null);
  const [events, setEvents] = useState<MonitoringEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, ev] = await Promise.all([monitoringApi.getOverview(24), monitoringApi.listEvents({ limit: 100 })]);
      setOverview(ov);
      setEvents(ev.items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load events.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const acknowledge = async (id: string) => {
    await monitoringApi.acknowledgeAlert(id);
    await load();
  };
  const resolve = async (id: string) => {
    await monitoringApi.resolveAlert(id);
    await load();
  };

  if (loading) return <p style={{ color: colors.muted, textAlign: 'center', padding: '2rem' }}>Loading events…</p>;

  return (
    <div>
      {error && <ErrorBanner message={error} />}
      {overview && overview.alerts.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontWeight: 600, color: colors.text, marginBottom: '0.5rem' }}>Open alerts</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {overview.alerts.map((a) => (
              <Card key={a.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.75rem' }}>
                <div style={{ fontSize: '0.875rem' }}>
                  <strong>{a.rule_name ?? a.id}</strong> · {a.event_count} events
                  <div style={{ color: colors.muted, fontSize: '0.75rem' }}>{a.sample_message ?? ''}</div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button variant="secondary" onClick={() => void acknowledge(a.id)}>Acknowledge</Button>
                  <Button onClick={() => void resolve(a.id)}>Resolve</Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <h3 style={{ fontWeight: 600, color: colors.text, marginBottom: '0.5rem' }}>Recent events</h3>
      <Card style={{ padding: 0, overflow: 'auto' }}>
        <table style={tableStyles.table}>
          <thead>
            <tr>
              {['Severity', 'Category', 'Message', 'Tenant', 'When'].map((h) => (
                <th key={h} style={tableStyles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr><td colSpan={5} style={{ ...tableStyles.td, textAlign: 'center', color: colors.muted, padding: '1.5rem' }}>No events.</td></tr>
            ) : (
              events.map((e) => (
                <tr key={e.id}>
                  <td style={tableStyles.td}><StatusBadge status={e.severity} /></td>
                  <td style={{ ...tableStyles.td, fontFamily: 'monospace', fontSize: '0.75rem' }}>{e.category}</td>
                  <td style={{ ...tableStyles.td, maxWidth: '24rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.message}>{e.message}</td>
                  <td style={{ ...tableStyles.td, fontFamily: 'monospace', fontSize: '0.75rem' }}>{e.tenant_id ?? '—'}</td>
                  <td style={tableStyles.td}>{formatTime(e.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

const SystemHealthCenter: React.FC = () => {
  const [tab, setTab] = useState<TabId>('health');
  const [snapshot, setSnapshot] = useState<HealthCenterSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await monitoringApi.getHealthCenter());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load health center.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== 'events') void load();
  }, [tab, load]);

  const tabs = [
    { id: 'health', label: 'Overview' },
    { id: 'api', label: 'API Performance' },
    { id: 'database', label: 'Database' },
    { id: 'sync', label: 'Sync Diagnostics' },
    { id: 'audit', label: 'Audit Coverage' },
    { id: 'events', label: 'Events & Alerts' },
  ];

  return (
    <div>
      <PageHeader
        title="System Health Center"
        subtitle="Read-only operational dashboard — API, database, synchronization, audit, and errors."
        action={tab !== 'events' ? <Button variant="secondary" onClick={() => void load()} disabled={loading}>Refresh</Button> : undefined}
      />

      {error && <ErrorBanner message={error} />}

      <Tabs tabs={tabs} active={tab} onChange={(id) => setTab(id as TabId)} />

      {tab === 'events' && <EventsTab />}

      {tab !== 'events' && loading && !snapshot && (
        <p style={{ color: colors.muted, textAlign: 'center', padding: '3rem' }}>Loading health center…</p>
      )}

      {tab === 'health' && snapshot && (
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <StatusBadge status={snapshot.overallStatus} />
            <span style={{ fontSize: '0.75rem', color: colors.muted }}>Updated {formatTime(snapshot.generatedAt)}</span>
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <MetricGrid>
              <MetricCard label="API requests (60m)" value={snapshot.backend.api.totalRequests} />
              <MetricCard label="API errors (60m)" value={snapshot.backend.api.totalErrors} />
              <MetricCard label="Slow APIs" value={snapshot.backend.api.slowCriticalCount} sub={`${snapshot.backend.api.slowWarningCount} warnings`} />
              <MetricCard label="Errors (24h)" value={snapshot.errors.recentErrors} />
              <MetricCard label="Sync pending" value={snapshot.synchronization.queue.pending} />
              <MetricCard label="Sync failed" value={snapshot.synchronization.queue.failed} />
              <MetricCard label="Socket clients" value={snapshot.synchronization.connectedSocketClients} />
              <MetricCard label="DB pool waiting" value={snapshot.database.pool.waitingCount} sub={`${snapshot.database.pool.totalCount}/${snapshot.database.pool.maxConnections} in use`} />
            </MetricGrid>
          </div>
          <Card>
            <h3 style={{ fontWeight: 600, color: colors.text, marginBottom: '0.75rem' }}>Component health</h3>
            {snapshot.backend.components.map((c) => (
              <div key={c.component} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', fontSize: '0.875rem', padding: '0.25rem 0' }}>
                <span style={{ color: colors.text, fontWeight: 500 }}>{c.component}</span>
                <StatusBadge status={c.status} />
              </div>
            ))}
          </Card>
          <p style={{ fontSize: '0.75rem', color: colors.muted, marginTop: '1rem' }}>{snapshot.frontend.note}</p>
        </div>
      )}

      {tab === 'api' && snapshot && (
        <div>
          <div style={{ marginBottom: '1rem' }}>
            <MetricGrid>
              <MetricCard label="Total requests" value={snapshot.backend.api.totalRequests} />
              <MetricCard label="Warning breaches" value={snapshot.backend.api.slowWarningCount} />
              <MetricCard label="Critical breaches" value={snapshot.backend.api.slowCriticalCount} />
            </MetricGrid>
          </div>
          <ApiTable endpoints={snapshot.backend.api.endpoints} thresholds={snapshot.backend.api.thresholds} />
        </div>
      )}

      {tab === 'database' && snapshot && (
        <div>
          <div style={{ marginBottom: '1.5rem' }}>
            <MetricGrid>
              <MetricCard label="Pool total" value={snapshot.database.pool.totalCount} />
              <MetricCard label="Idle" value={snapshot.database.pool.idleCount} />
              <MetricCard label="Waiting" value={snapshot.database.pool.waitingCount} />
              <MetricCard label="Locks waiting" value={snapshot.database.lockContention.waitingLocks} />
            </MetricGrid>
          </div>
          <Card>
            <h3 style={{ fontWeight: 600, color: colors.text, marginBottom: '0.75rem' }}>Slow requests (monitoring events)</h3>
            {snapshot.database.slowQueriesFromMonitoring.length === 0 ? (
              <p style={{ fontSize: '0.875rem', color: colors.muted }}>No slow query events recorded.</p>
            ) : (
              snapshot.database.slowQueriesFromMonitoring.slice(0, 20).map((q, i) => (
                <div key={i} style={{ borderBottom: `1px solid ${colors.border}`, paddingBottom: '0.5rem', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: colors.muted }}>{q.method} {q.route}</span>
                  <span style={{ marginLeft: '0.5rem', color: colors.warn, fontWeight: 600 }}>{q.durationMs ?? '—'}ms</span>
                  <p style={{ color: colors.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.message}</p>
                </div>
              ))
            )}
          </Card>
        </div>
      )}

      {tab === 'sync' && snapshot && (
        <div>
          <div style={{ marginBottom: '1.5rem' }}>
            <MetricGrid>
              <MetricCard label="Pending" value={snapshot.synchronization.queue.pending} />
              <MetricCard label="Processing" value={snapshot.synchronization.queue.processing} />
              <MetricCard label="Failed" value={snapshot.synchronization.queue.failed} />
              <MetricCard label="Completed (24h)" value={snapshot.synchronization.queue.completed24h} />
              <MetricCard label="Retried (24h)" value={snapshot.synchronization.queue.retried24h} />
            </MetricGrid>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            <Card>
              <h3 style={{ fontWeight: 600, color: colors.text, marginBottom: '0.75rem' }}>Recent failed</h3>
              {snapshot.synchronization.recentFailed.length === 0 ? (
                <p style={{ fontSize: '0.875rem', color: colors.muted }}>No failed queue items.</p>
              ) : (
                snapshot.synchronization.recentFailed.map((row) => (
                  <div key={row.id} style={{ borderBottom: `1px solid ${colors.border}`, paddingBottom: '0.5rem', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    <span style={{ fontWeight: 500 }}>{row.entityType}</span> · {row.action}
                    <p style={{ fontSize: '0.75rem', color: colors.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.lastError}</p>
                  </div>
                ))
              )}
            </Card>
            <Card>
              <h3 style={{ fontWeight: 600, color: colors.text, marginBottom: '0.75rem' }}>Recent pending</h3>
              {snapshot.synchronization.recentPending.length === 0 ? (
                <p style={{ fontSize: '0.875rem', color: colors.muted }}>Queue is clear.</p>
              ) : (
                snapshot.synchronization.recentPending.map((row) => (
                  <div key={row.id} style={{ borderBottom: `1px solid ${colors.border}`, paddingBottom: '0.5rem', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    <span style={{ fontWeight: 500 }}>{row.entityType}</span> · {row.action}
                    <p style={{ fontSize: '0.75rem', color: colors.muted }}>attempts: {row.attempts}</p>
                  </div>
                ))
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === 'audit' && snapshot && (
        <div>
          <div style={{ marginBottom: '1.5rem' }}>
            <MetricGrid>
              <MetricCard label="Audit events (30d)" value={snapshot.audit.eventsInWindow} />
              <MetricCard label="Coverage gaps" value={snapshot.audit.gaps.length} />
            </MetricGrid>
          </div>
          {snapshot.audit.gaps.length > 0 && (
            <Card style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a', marginBottom: '1.5rem' }}>
              <h3 style={{ fontWeight: 600, color: colors.warn, marginBottom: '0.5rem' }}>Identified gaps</h3>
              {snapshot.audit.gaps.map((g, i) => (
                <div key={i} style={{ fontSize: '0.875rem', color: colors.warn }}>
                  <strong>{g.type}:</strong> {g.id} — {g.note}
                </div>
              ))}
            </Card>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
            <Card>
              <h3 style={{ fontWeight: 600, color: colors.text, marginBottom: '0.75rem' }}>By module</h3>
              {Object.entries(snapshot.audit.byModule).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', padding: '0.125rem 0' }}>
                  <span style={{ color: colors.muted }}>{k}</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </Card>
            <Card>
              <h3 style={{ fontWeight: 600, color: colors.text, marginBottom: '0.75rem' }}>By action</h3>
              {Object.entries(snapshot.audit.byAction).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', padding: '0.125rem 0' }}>
                  <span style={{ color: colors.muted }}>{k}</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemHealthCenter;
