import React, { useCallback, useEffect, useState } from 'react';
import Button from '../ui/Button';
import {
  adminMonitoringApi,
  type HealthCenterSnapshot,
  type ApiEndpointStat,
} from '../../services/api/adminMonitoringApi';
import AdminMonitoringDashboard from './AdminMonitoringDashboard';

type TabId = 'health' | 'api' | 'database' | 'sync' | 'audit' | 'events';

function statusBadge(status: string): string {
  if (status === 'healthy') return 'bg-emerald-100 text-emerald-800';
  if (status === 'degraded') return 'bg-amber-100 text-amber-900';
  return 'bg-rose-100 text-rose-800';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

function ApiTable({ endpoints, thresholds }: { endpoints: ApiEndpointStat[]; thresholds: { warnMs: number; criticalMs: number } }) {
  if (endpoints.length === 0) {
    return <p className="text-sm text-slate-500 py-6 text-center">No API traffic recorded in this window.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Method</th>
            <th className="px-3 py-2">Path</th>
            <th className="px-3 py-2 text-right">Requests</th>
            <th className="px-3 py-2 text-right">Errors</th>
            <th className="px-3 py-2 text-right">Avg</th>
            <th className="px-3 py-2 text-right">P95</th>
            <th className="px-3 py-2 text-right">P99</th>
            <th className="px-3 py-2 text-right">Warn+</th>
          </tr>
        </thead>
        <tbody>
          {endpoints.map((ep) => {
            const slow = ep.p95Ms >= thresholds.criticalMs;
            const warn = !slow && ep.p95Ms >= thresholds.warnMs;
            return (
              <tr key={ep.routeKey} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs">{ep.method}</td>
                <td className="px-3 py-2 font-mono text-xs max-w-xs truncate" title={ep.path}>
                  {ep.path}
                </td>
                <td className="px-3 py-2 text-right">{ep.requestCount}</td>
                <td className="px-3 py-2 text-right text-rose-700">{ep.errorCount}</td>
                <td className="px-3 py-2 text-right">{Math.round(ep.avgMs)}ms</td>
                <td className={`px-3 py-2 text-right font-semibold ${slow ? 'text-rose-700' : warn ? 'text-amber-700' : ''}`}>
                  {Math.round(ep.p95Ms)}ms
                </td>
                <td className="px-3 py-2 text-right">{Math.round(ep.p99Ms)}ms</td>
                <td className="px-3 py-2 text-right text-amber-700">
                  {ep.warningBreaches + ep.criticalBreaches}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-slate-500 px-3 py-2 border-t border-slate-100">
        Thresholds: warning &gt;{thresholds.warnMs}ms · critical &gt;{thresholds.criticalMs}ms (p95)
      </p>
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
      const data = await adminMonitoringApi.getHealthCenter();
      setSnapshot(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load health center.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== 'events') void load();
  }, [tab, load]);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'health', label: 'Overview' },
    { id: 'api', label: 'API Performance' },
    { id: 'database', label: 'Database' },
    { id: 'sync', label: 'Sync Diagnostics' },
    { id: 'audit', label: 'Audit Coverage' },
    { id: 'events', label: 'Events & Alerts' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">System Health Center</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Read-only operational dashboard — API, database, synchronization, audit, and errors.
          </p>
        </div>
        {tab !== 'events' && (
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === t.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'events' && <AdminMonitoringDashboard />}

      {tab !== 'events' && loading && !snapshot && (
        <p className="text-center text-slate-400 py-12">Loading health center…</p>
      )}

      {tab === 'health' && snapshot && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex px-3 py-1 rounded-full text-sm font-bold ${statusBadge(snapshot.overallStatus)}`}>
              {snapshot.overallStatus}
            </span>
            <span className="text-xs text-slate-500">Updated {formatTime(snapshot.generatedAt)}</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="API requests (60m)" value={snapshot.backend.api.totalRequests} />
            <MetricCard label="API errors (60m)" value={snapshot.backend.api.totalErrors} />
            <MetricCard
              label="Slow APIs"
              value={snapshot.backend.api.slowCriticalCount}
              sub={`${snapshot.backend.api.slowWarningCount} warnings`}
            />
            <MetricCard label="Errors (24h)" value={snapshot.errors.recentErrors} />
            <MetricCard label="Sync pending" value={snapshot.synchronization.queue.pending} />
            <MetricCard label="Sync failed" value={snapshot.synchronization.queue.failed} />
            <MetricCard label="Socket clients" value={snapshot.synchronization.connectedSocketClients} />
            <MetricCard
              label="DB pool waiting"
              value={snapshot.database.pool.waitingCount}
              sub={`${snapshot.database.pool.totalCount}/${snapshot.database.pool.maxConnections} in use`}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-3">Component health</h3>
            <ul className="space-y-2">
              {snapshot.backend.components.map((c) => (
                <li key={c.component} className="flex items-start justify-between gap-4 text-sm">
                  <span className="text-slate-700 font-medium">{c.component}</span>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-bold ${statusBadge(c.status)}`}>
                    {c.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-slate-500">{snapshot.frontend.note}</p>
        </div>
      )}

      {tab === 'api' && snapshot && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard label="Total requests" value={snapshot.backend.api.totalRequests} />
            <MetricCard label="Warning breaches" value={snapshot.backend.api.slowWarningCount} />
            <MetricCard label="Critical breaches" value={snapshot.backend.api.slowCriticalCount} />
          </div>
          <ApiTable endpoints={snapshot.backend.api.endpoints} thresholds={snapshot.backend.api.thresholds} />
        </div>
      )}

      {tab === 'database' && snapshot && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Pool total" value={snapshot.database.pool.totalCount} />
            <MetricCard label="Idle" value={snapshot.database.pool.idleCount} />
            <MetricCard label="Waiting" value={snapshot.database.pool.waitingCount} />
            <MetricCard label="Locks waiting" value={snapshot.database.lockContention.waitingLocks} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-3">Slow requests (monitoring events)</h3>
            {snapshot.database.slowQueriesFromMonitoring.length === 0 ? (
              <p className="text-sm text-slate-500">No slow query events recorded.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {snapshot.database.slowQueriesFromMonitoring.slice(0, 20).map((q, i) => (
                  <li key={i} className="border-b border-slate-100 pb-2">
                    <span className="font-mono text-xs text-slate-600">
                      {q.method} {q.route}
                    </span>
                    <span className="ml-2 text-amber-700 font-semibold">{q.durationMs ?? '—'}ms</span>
                    <p className="text-slate-600 truncate">{q.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {snapshot.database.pgStatStatementsAvailable && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-3">Top slow statements (pg_stat_statements)</h3>
              <ul className="space-y-2 text-xs font-mono">
                {snapshot.database.topSlowStatements.map((s, i) => (
                  <li key={i} className="border-b border-slate-100 pb-2">
                    <span className="text-amber-700">{Math.round(s.meanMs)}ms avg</span>
                    <span className="text-slate-500 ml-2">({s.calls} calls)</span>
                    <p className="text-slate-600 truncate mt-1">{s.query}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === 'sync' && snapshot && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard label="Pending" value={snapshot.synchronization.queue.pending} />
            <MetricCard label="Processing" value={snapshot.synchronization.queue.processing} />
            <MetricCard label="Failed" value={snapshot.synchronization.queue.failed} />
            <MetricCard label="Completed (24h)" value={snapshot.synchronization.queue.completed24h} />
            <MetricCard label="Retried (24h)" value={snapshot.synchronization.queue.retried24h} />
          </div>
          <p className="text-xs text-slate-500">
            Observe-only diagnostics — sync_queue and change_log. Does not modify synchronization behavior.
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-3">Recent failed</h3>
              {snapshot.synchronization.recentFailed.length === 0 ? (
                <p className="text-sm text-slate-500">No failed queue items.</p>
              ) : (
                <ul className="space-y-2 text-sm max-h-64 overflow-y-auto">
                  {snapshot.synchronization.recentFailed.map((row) => (
                    <li key={row.id} className="border-b border-slate-100 pb-2">
                      <span className="font-medium">{row.entityType}</span> · {row.action}
                      <p className="text-xs text-slate-500 truncate">{row.lastError}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-3">Recent pending</h3>
              {snapshot.synchronization.recentPending.length === 0 ? (
                <p className="text-sm text-slate-500">Queue is clear.</p>
              ) : (
                <ul className="space-y-2 text-sm max-h-64 overflow-y-auto">
                  {snapshot.synchronization.recentPending.map((row) => (
                    <li key={row.id} className="border-b border-slate-100 pb-2">
                      <span className="font-medium">{row.entityType}</span> · {row.action}
                      <p className="text-xs text-slate-500">attempts: {row.attempts}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'audit' && snapshot && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard label="Audit events (30d)" value={snapshot.audit.eventsInWindow} />
            <MetricCard label="Coverage gaps" value={snapshot.audit.gaps.length} />
          </div>

          {snapshot.audit.gaps.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="font-semibold text-amber-900 mb-2">Identified gaps</h3>
              <ul className="text-sm text-amber-900 space-y-1">
                {snapshot.audit.gaps.map((g, i) => (
                  <li key={i}>
                    <span className="font-medium">{g.type}:</span> {g.id} — {g.note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-3">By module</h3>
              <ul className="space-y-1 text-sm">
                {Object.entries(snapshot.audit.byModule).map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span className="text-slate-600">{k}</span>
                    <span className="font-mono font-semibold">{v}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-3">By action</h3>
              <ul className="space-y-1 text-sm">
                {Object.entries(snapshot.audit.byAction).map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span className="text-slate-600">{k}</span>
                    <span className="font-mono font-semibold">{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemHealthCenter;
