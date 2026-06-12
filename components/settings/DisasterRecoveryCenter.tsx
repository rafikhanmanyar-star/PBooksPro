import React, { useCallback, useEffect, useState } from 'react';
import {
  Shield,
  HardDrive,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Play,
  FileText,
  Bell,
  Activity,
  Database,
} from 'lucide-react';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { usePermissions } from '../../hooks/usePermissions';
import { useNotification } from '../../context/NotificationContext';
import {
  disasterRecoveryApi,
  type DrAlert,
  type DrDashboard,
  type DrNotificationSettings,
  type DrReport,
  type DrRestoreTest,
  type DrVerificationRun,
} from '../../services/api/disasterRecoveryApi';
import Button from '../ui/Button';
import {
  backupAlertError,
  backupAlertSuccess,
  backupAlertWarning,
} from './backupThemeClasses';

function formatBytes(n: number | string | null | undefined): string {
  if (n == null) return '—';
  const v = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
  return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function healthColor(label: string): string {
  if (label === 'healthy') return `${backupAlertSuccess} border`;
  if (label === 'degraded') return `${backupAlertWarning} border`;
  return `${backupAlertError} border text-ds-danger`;
}

function severityBadge(severity: string): string {
  if (severity === 'critical') return 'bg-[color:var(--badge-unpaid-bg)] text-ds-danger border border-ds-danger/30';
  if (severity === 'warning') return 'bg-[color:var(--badge-partial-bg)] text-ds-warning border border-ds-warning/30';
  return 'bg-primary/15 text-primary border border-primary/20';
}

type WidgetProps = {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

const Widget: React.FC<WidgetProps> = ({ title, icon, children, className = '' }) => (
  <div className={`p-4 rounded-xl border border-app-border bg-app-card shadow-ds-card ${className}`}>
    <div className="flex items-center gap-2 mb-2 text-app-muted text-xs font-medium uppercase tracking-wide">
      {icon}
      <span>{title}</span>
    </div>
    {children}
  </div>
);

const DisasterRecoveryCenter: React.FC = () => {
  const { has } = usePermissions();
  const { showNotification } = useNotification();
  const canRead = has('backups.read');
  const canManage = has('backups.manage');

  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DrDashboard | null>(null);
  const [alerts, setAlerts] = useState<DrAlert[]>([]);
  const [verifications, setVerifications] = useState<DrVerificationRun[]>([]);
  const [restoreTests, setRestoreTests] = useState<DrRestoreTest[]>([]);
  const [reports, setReports] = useState<DrReport[]>([]);
  const [notifSettings, setNotifSettings] = useState<DrNotificationSettings | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (isLocalOnlyMode() || !canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [dash, alertsRes, verRes, testRes, reportRes, settings] = await Promise.all([
        disasterRecoveryApi.getDashboard(),
        disasterRecoveryApi.listAlerts(false),
        disasterRecoveryApi.listVerificationHistory(),
        disasterRecoveryApi.listRestoreTests(),
        disasterRecoveryApi.listReports(),
        disasterRecoveryApi.getNotificationSettings(),
      ]);
      setDashboard(dash);
      setAlerts(alertsRes.items);
      setVerifications(verRes.items);
      setRestoreTests(testRes.items);
      setReports(reportRes.items);
      setNotifSettings(settings);
      setEmailInput(settings.email_recipients.join(', '));
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Failed to load DR dashboard.', 'error');
    } finally {
      setLoading(false);
    }
  }, [canRead, showNotification]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      await load();
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Action failed.', 'error');
    } finally {
      setBusy(null);
    }
  };

  if (isLocalOnlyMode()) {
    return (
      <div className="p-6 text-center text-app-muted">
        Disaster Recovery Center requires the API server (PostgreSQL mode).
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="p-6 text-center text-app-muted">
        You do not have permission to view disaster recovery.
      </div>
    );
  }

  if (loading && !dashboard) {
    return (
      <div className="p-8 flex justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-app-muted" />
      </div>
    );
  }

  const health = dashboard?.backupHealth;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-app-text flex items-center gap-2">
            <Shield className="w-6 h-6 text-ds-primary" />
            Disaster Recovery Center
          </h2>
          <p className="text-sm text-app-muted mt-1">
            Monitor backup health, run integrity checks, simulate restores, and manage alerts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void load()} disabled={!!busy}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {canManage && (
            <>
              <Button
                variant="primary"
                disabled={!!busy}
                onClick={() =>
                  runAction('verify', async () => {
                    await disasterRecoveryApi.verifyLatest();
                    showNotification('Backup verification completed.', 'success');
                  })
                }
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                Verify Latest
              </Button>
              <Button
                variant="primary"
                disabled={!!busy}
                onClick={() =>
                  runAction('simulate', async () => {
                    await disasterRecoveryApi.runRestoreTestLatest('simulation');
                    showNotification('Restore simulation completed.', 'success');
                  })
                }
              >
                <Play className="w-4 h-4 mr-1" />
                Simulate Restore
              </Button>
              <Button
                variant="secondary"
                disabled={!!busy}
                onClick={() =>
                  runAction('recovery', async () => {
                    await disasterRecoveryApi.runRestoreTestLatest('recovery');
                    showNotification('Recovery test completed.', 'success');
                  })
                }
              >
                <Activity className="w-4 h-4 mr-1" />
                Recovery Test
              </Button>
              <Button
                variant="secondary"
                disabled={!!busy}
                onClick={() =>
                  runAction('report', async () => {
                    await disasterRecoveryApi.generateReport('manual');
                    showNotification('DR report generated.', 'success');
                  })
                }
              >
                <FileText className="w-4 h-4 mr-1" />
                Generate Report
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Widget title="Last Backup" icon={<Database className="w-4 h-4" />}>
          {dashboard?.lastBackup ? (
            <>
              <div className="text-lg font-semibold text-app-text">
                {formatDateTime(dashboard.lastBackup.at)}
              </div>
              <div className="text-sm text-app-muted mt-1">
                {dashboard.lastBackup.jobName ?? 'Unknown job'}
              </div>
              <div className="mt-2 flex items-center gap-1 text-sm">
                {dashboard.lastBackup.success ? (
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
                <span>{dashboard.lastBackup.success ? 'Success' : 'Failed'}</span>
              </div>
            </>
          ) : (
            <div className="text-app-muted">No backups yet</div>
          )}
        </Widget>

        <Widget title="Last Successful Backup" icon={<CheckCircle className="w-4 h-4" />}>
          {dashboard?.lastSuccessfulBackup ? (
            <>
              <div className="text-lg font-semibold text-app-text">
                {formatDateTime(dashboard.lastSuccessfulBackup.at)}
              </div>
              <div className="text-sm text-app-muted mt-1">
                {dashboard.lastSuccessfulBackup.jobName ?? '—'}
              </div>
            </>
          ) : (
            <div className="text-app-muted">None recorded</div>
          )}
        </Widget>

        <Widget title="Last Restore Test" icon={<Play className="w-4 h-4" />}>
          {dashboard?.lastRestoreTest ? (
            <>
              <div className="text-lg font-semibold text-app-text">
                {formatDateTime(dashboard.lastRestoreTest.at)}
              </div>
              <div className="text-sm text-app-muted mt-1 capitalize">
                {dashboard.lastRestoreTest.testType} — {dashboard.lastRestoreTest.status}
              </div>
            </>
          ) : (
            <div className="text-app-muted">No tests yet</div>
          )}
        </Widget>

        <Widget title="Backup Size" icon={<HardDrive className="w-4 h-4" />}>
          <div className="text-2xl font-bold text-app-text">
            {formatBytes(dashboard?.backupSizeBytes)}
          </div>
          <div className="text-sm text-app-muted mt-1">Latest successful dump</div>
        </Widget>

        <Widget title="Backup Health" icon={<Shield className="w-4 h-4" />}>
          {health ? (
            <>
              <div
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-lg font-bold ${healthColor(health.label)}`}
              >
                {health.score}/100
                <span className="text-sm font-medium capitalize">{health.label}</span>
              </div>
              <ul className="mt-3 space-y-1 text-xs text-app-muted">
                {health.factors.map((f) => (
                  <li key={f.id} className="flex justify-between gap-2">
                    <span>{f.label}</span>
                    <span>
                      {f.score}/{f.maxScore}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="text-app-muted">—</div>
          )}
        </Widget>

        <Widget title="Storage Usage" icon={<HardDrive className="w-4 h-4" />}>
          <div className="text-2xl font-bold text-app-text">
            {formatBytes(dashboard?.storageUsage.totalBytes)}
          </div>
          <div className="text-sm text-app-muted mt-2 space-y-0.5">
            <div>Local: {formatBytes(dashboard?.storageUsage.localBytes)}</div>
            <div>Offsite: {formatBytes(dashboard?.storageUsage.offsiteBytes)}</div>
            <div>{dashboard?.storageUsage.fileCount ?? 0} local dump file(s)</div>
          </div>
        </Widget>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-xl border border-app-border bg-app-card p-4">
          <h3 className="font-semibold text-app-text flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Backup Alerts
          </h3>
          {alerts.length === 0 ? (
            <p className="text-sm text-app-muted">No open alerts.</p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className="p-3 rounded-lg border border-app-border bg-app-bg/80 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${severityBadge(a.severity)}`}
                      >
                        {a.severity}
                      </span>
                      <div className="font-medium text-app-text mt-1">{a.title}</div>
                      <div className="text-app-muted mt-0.5">{a.message}</div>
                      <div className="text-xs text-app-muted mt-1">{formatDateTime(a.created_at)}</div>
                    </div>
                    {canManage && (
                      <Button
                        variant="secondary"
                        className="text-xs shrink-0"
                        disabled={!!busy}
                        onClick={() =>
                          runAction(`ack-${a.id}`, async () => {
                            await disasterRecoveryApi.acknowledgeAlert(a.id);
                          })
                        }
                      >
                        Acknowledge
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {canManage && notifSettings && (
          <section className="rounded-xl border border-app-border bg-app-card p-4">
            <h3 className="font-semibold text-app-text flex items-center gap-2 mb-3">
              <Bell className="w-5 h-5 text-ds-primary" />
              Email Notifications
            </h3>
            <label className="flex items-center gap-2 text-sm mb-3">
              <input
                type="checkbox"
                checked={notifSettings.enabled}
                onChange={(e) =>
                  setNotifSettings({ ...notifSettings, enabled: e.target.checked })
                }
              />
              Enable email alerts
            </label>
            <label className="block text-sm text-app-muted mb-1">Recipients (comma-separated)</label>
            <input
              type="text"
              className="w-full border border-app-border rounded-lg px-3 py-2 text-sm mb-3"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="admin@example.com, ops@example.com"
            />
            <label className="block text-sm text-app-muted mb-1">
              Stale backup threshold (hours)
            </label>
            <input
              type="number"
              min={1}
              className="w-32 border border-app-border rounded-lg px-3 py-2 text-sm mb-3"
              value={notifSettings.stale_backup_hours}
              onChange={(e) =>
                setNotifSettings({
                  ...notifSettings,
                  stale_backup_hours: Number(e.target.value) || 48,
                })
              }
            />
            <div className="space-y-1 text-sm mb-4">
              {(
                [
                  ['alert_on_backup_failure', 'Alert on backup failure'],
                  ['alert_on_verification_failure', 'Alert on verification failure'],
                  ['alert_on_stale_backup', 'Alert on stale backup'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={notifSettings[key]}
                    onChange={(e) =>
                      setNotifSettings({ ...notifSettings, [key]: e.target.checked })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <Button
              variant="primary"
              disabled={!!busy}
              onClick={() =>
                runAction('save-notif', async () => {
                  await disasterRecoveryApi.updateNotificationSettings({
                    enabled: notifSettings.enabled,
                    email_recipients: emailInput
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                    alert_on_backup_failure: notifSettings.alert_on_backup_failure,
                    alert_on_verification_failure: notifSettings.alert_on_verification_failure,
                    alert_on_stale_backup: notifSettings.alert_on_stale_backup,
                    stale_backup_hours: notifSettings.stale_backup_hours,
                  });
                  showNotification('Notification settings saved.', 'success');
                })
              }
            >
              Save Settings
            </Button>
            <p className="text-xs text-app-muted mt-2">
              Configure DR_SMTP_HOST and related env vars on the API server for delivery.
            </p>
          </section>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-xl border border-app-border bg-app-card p-4">
          <h3 className="font-semibold text-app-text mb-3">Verification History</h3>
          {verifications.length === 0 ? (
            <p className="text-sm text-app-muted">No verifications yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-app-muted border-b">
                    <th className="py-2 pr-2">Date</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {verifications.slice(0, 8).map((v) => (
                    <tr key={v.id} className="border-b border-app-border">
                      <td className="py-2 pr-2">{formatDateTime(v.completed_at ?? v.started_at)}</td>
                      <td className="py-2 pr-2 capitalize">{v.status}</td>
                      <td className="py-2">{v.integrity_score ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-app-border bg-app-card p-4">
          <h3 className="font-semibold text-app-text mb-3">Restore Test History</h3>
          {restoreTests.length === 0 ? (
            <p className="text-sm text-app-muted">No restore tests yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-app-muted border-b">
                    <th className="py-2 pr-2">Date</th>
                    <th className="py-2 pr-2">Type</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {restoreTests.slice(0, 8).map((t) => (
                    <tr key={t.id} className="border-b border-app-border">
                      <td className="py-2 pr-2">{formatDateTime(t.completed_at ?? t.started_at)}</td>
                      <td className="py-2 pr-2 capitalize">{t.test_type}</td>
                      <td className="py-2 capitalize">{t.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-app-border bg-app-card p-4">
        <h3 className="font-semibold text-app-text mb-3">Disaster Recovery Reports</h3>
        {reports.length === 0 ? (
          <p className="text-sm text-app-muted">Generate a report to see DR status snapshots.</p>
        ) : (
          <ul className="space-y-2">
            {reports.slice(0, 5).map((r) => {
              const recs = (r.summary.recommendations as string[] | undefined) ?? [];
              return (
                <li key={r.id} className="p-3 rounded-lg border border-app-border text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium capitalize">{r.report_type.replace('_', ' ')}</span>
                    <span className="text-app-muted">{formatDateTime(r.generated_at)}</span>
                  </div>
                  <div className="text-app-muted mt-1">Health score: {r.health_score}/100</div>
                  {recs.length > 0 && (
                    <ul className="mt-2 list-disc list-inside text-app-muted text-xs">
                      {recs.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

export default DisasterRecoveryCenter;
