import React, { useCallback, useEffect, useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import {
  adminMonitoringApi,
  type MonitoringEvent,
  type MonitoringOverview,
} from '../../services/api/adminMonitoringApi';

type TabId = 'overview' | 'logs' | 'alerts' | 'health';

function statusColor(status: string): string {
  if (status === 'healthy') return 'bg-emerald-100 text-emerald-800';
  if (status === 'degraded') return 'bg-amber-100 text-amber-900';
  if (status === 'unhealthy' || status === 'open') return 'bg-rose-100 text-rose-800';
  if (status === 'acknowledged') return 'bg-sky-100 text-sky-800';
  return 'bg-slate-100 text-slate-700';
}

function severityColor(severity: string): string {
  if (severity === 'critical') return 'text-rose-700 bg-rose-50';
  if (severity === 'error') return 'text-red-700 bg-red-50';
  if (severity === 'warn') return 'text-amber-800 bg-amber-50';
  return 'text-slate-600 bg-slate-50';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const CATEGORY_LABELS: Record<string, string> = {
  application_error: 'App Errors',
  api_failure: 'API Failures',
  database: 'Database',
  authentication: 'Auth',
  payment: 'Payment',
  performance: 'Performance',
  email: 'Email',
  user_activity: 'Activity',
  sync: 'Synchronization',
};

const AdminMonitoringDashboard: React.FC = () => {
  const [tab, setTab] = useState<TabId>('overview');
  const [overview, setOverview] = useState<MonitoringOverview | null>(null);
  const [events, setEvents] = useState<MonitoringEvent[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [healthRunning, setHealthRunning] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminMonitoringApi.getOverview(24);
      setOverview(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load monitoring data.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminMonitoringApi.listEvents({
        category: categoryFilter || undefined,
        search: search || undefined,
        limit: 100,
      });
      setEvents(res.items);
      setEventsTotal(res.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load events.');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, search]);

  useEffect(() => {
    if (tab === 'logs') void loadEvents();
    else void loadOverview();
  }, [tab, loadOverview, loadEvents]);

  const handleHealthRefresh = async () => {
    setHealthRunning(true);
    try {
      const health = await adminMonitoringApi.runHealthCheck();
      setOverview((prev) => (prev ? { ...prev, health } : prev));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Health check failed.');
    } finally {
      setHealthRunning(false);
    }
  };

  const handleAckAlert = async (id: string) => {
    await adminMonitoringApi.acknowledgeAlert(id);
    await loadOverview();
  };

  const handleResolveAlert = async (id: string) => {
    await adminMonitoringApi.resolveAlert(id);
    await loadOverview();
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'logs', label: 'Log Viewer' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'health', label: 'Health Checks' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Production Monitoring</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Errors, API health, payments, email delivery, and performance — last 24 hours.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void (tab === 'logs' ? loadEvents() : loadOverview())}>
          Refresh
        </Button>
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

      {loading && !overview && tab !== 'logs' && (
        <p className="text-center text-slate-400 py-12">Loading monitoring data…</p>
      )}

      {tab === 'overview' && overview && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">System health</p>
              <p className="mt-2">
                <span className={`inline-flex px-2.5 py-1 rounded-full text-sm font-bold ${statusColor(overview.health.status)}`}>
                  {overview.health.status}
                </span>
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Errors (24h)</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{overview.stats.recentErrors}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Slow requests</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{overview.stats.slowRequests}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Open alerts</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{overview.alerts.length}</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-3">Events by category</h3>
              <ul className="space-y-2">
                {overview.categories.map((cat) => (
                  <li key={cat.id} className="flex justify-between text-sm">
                    <span className="text-slate-600">{cat.label}</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {overview.stats.byCategory[cat.id] ?? 0}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-3">Observability integrations</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between">
                  <span className="text-slate-600">Sentry</span>
                  <span className={overview.observability.sentry ? 'text-emerald-600 font-medium' : 'text-slate-400'}>
                    {overview.observability.sentry ? 'Configured' : 'Not set'}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-600">Application Insights</span>
                  <span className={overview.observability.applicationInsights ? 'text-emerald-600 font-medium' : 'text-slate-400'}>
                    {overview.observability.applicationInsights ? 'Configured' : 'Not set'}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-600">OpenTelemetry</span>
                  <span className={overview.observability.openTelemetry ? 'text-emerald-600 font-medium' : 'text-slate-400'}>
                    {overview.observability.openTelemetry ? 'Configured' : 'Not set'}
                  </span>
                </li>
              </ul>
              {overview.observability.registeredProviders.length > 0 && (
                <p className="text-xs text-slate-500 mt-3">
                  Active: {overview.observability.registeredProviders.join(', ')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'logs' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">All categories</option>
              {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <Input
              placeholder="Search message or code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button variant="secondary" onClick={() => void loadEvents()}>
              Search
            </Button>
          </div>
          <p className="text-xs text-slate-500">{eventsTotal} matching events</p>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold text-slate-600">Time</th>
                    <th className="text-left px-4 py-2 font-semibold text-slate-600">Category</th>
                    <th className="text-left px-4 py-2 font-semibold text-slate-600">Severity</th>
                    <th className="text-left px-4 py-2 font-semibold text-slate-600">Message</th>
                    <th className="text-left px-4 py-2 font-semibold text-slate-600">Route</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="px-4 py-2 whitespace-nowrap text-slate-500 text-xs">{formatTime(ev.created_at)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className="text-xs font-medium text-indigo-700">
                          {CATEGORY_LABELS[ev.category] ?? ev.category}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${severityColor(ev.severity)}`}>
                          {ev.severity}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-700 max-w-md truncate" title={ev.message}>
                        {ev.code ? `[${ev.code}] ` : ''}
                        {ev.message}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-400 max-w-[140px] truncate">
                        {ev.method} {ev.route}
                      </td>
                    </tr>
                  ))}
                  {events.length === 0 && !loading && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        No events match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'alerts' && overview && (
        <div className="space-y-3">
          {overview.alerts.length === 0 ? (
            <p className="text-center text-slate-400 py-12">No open alerts.</p>
          ) : (
            overview.alerts.map((alert) => (
              <div
                key={alert.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${statusColor(alert.status)}`}>
                      {alert.status}
                    </span>
                    <span className="font-semibold text-slate-800">{alert.rule_name ?? alert.rule_id}</span>
                  </div>
                  <p className="text-sm text-slate-600 mt-1 truncate">{alert.sample_message}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {alert.event_count} events · {formatTime(alert.triggered_at)}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {alert.status === 'open' && (
                    <Button variant="secondary" onClick={() => void handleAckAlert(alert.id)}>
                      Acknowledge
                    </Button>
                  )}
                  <Button variant="secondary" onClick={() => void handleResolveAlert(alert.id)}>
                    Resolve
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'health' && overview && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className={`inline-flex px-3 py-1 rounded-full text-sm font-bold ${statusColor(overview.health.status)}`}>
              Overall: {overview.health.status}
            </span>
            <Button variant="secondary" onClick={() => void handleHealthRefresh()} disabled={healthRunning}>
              {healthRunning ? 'Checking…' : 'Run health checks'}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {overview.health.components.map((c) => (
              <div key={c.component} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-semibold text-slate-800 capitalize">{c.component.replace(/_/g, ' ')}</h4>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${statusColor(c.status)}`}>
                    {c.status}
                  </span>
                </div>
                <p className="text-sm text-slate-600 mt-2">{c.message}</p>
                <p className="text-[10px] text-slate-400 mt-2">Checked {formatTime(c.checkedAt)}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Liveness: <code className="bg-slate-100 px-1 rounded">GET /health</code> · Readiness:{' '}
            <code className="bg-slate-100 px-1 rounded">GET /api/health/ready</code>
          </p>
        </div>
      )}
    </div>
  );
};

export default AdminMonitoringDashboard;
