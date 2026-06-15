import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Play,
  RotateCcw,
  HardDrive,
  Calendar,
  Cloud,
  CloudUpload,
} from 'lucide-react';
import { usePermissions } from '../../hooks/usePermissions';
import { useNotification } from '../../context/NotificationContext';
import {
  backupSchedulerApi,
  type BackupJob,
  type BackupJobRun,
} from '../../services/api/backupSchedulerApi';
import { backupStorageApi, type OffsiteUpload } from '../../services/api/backupStorageApi';
import { backupSecurityApi } from '../../services/api/backupSecurityApi';
import {
  backupAlertError,
  backupAlertInfo,
  backupAlertWarning,
} from './backupThemeClasses';
import Button from '../ui/Button';
import Select from '../ui/Select';

function formatBytes(raw: string | number | null | undefined): string {
  if (raw == null) return '—';
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${ms} ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem}s`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const BackupHistoryPage: React.FC = () => {
  const { has } = usePermissions();
  const { showNotification } = useNotification();
  const canRead = has('backups.read');
  const canManage = has('backups.manage');

  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [runs, setRuns] = useState<BackupJobRun[]>([]);
  const [total, setTotal] = useState(0);
  const [jobFilter, setJobFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [retryingRunId, setRetryingRunId] = useState<string | null>(null);
  const [schedulerEnabled, setSchedulerEnabled] = useState(false);
  const [storageRoot, setStorageRoot] = useState('');
  const [uploadsByRun, setUploadsByRun] = useState<Record<string, OffsiteUpload>>({});
  const [cloudActionRunId, setCloudActionRunId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [status, jobsRes, historyRes, uploadsRes] = await Promise.all([
        backupSchedulerApi.getStatus(),
        backupSchedulerApi.listJobs(),
        backupSchedulerApi.listHistory({
          jobId: jobFilter || undefined,
          limit: 100,
        }),
        backupStorageApi.listUploads().catch(() => ({ items: [] as OffsiteUpload[], count: 0 })),
      ]);
      setSchedulerEnabled(status.schedulerEnabled);
      setStorageRoot(status.storageRoot);
      setJobs(jobsRes.items);
      setRuns(historyRes.items);
      setTotal(historyRes.total);
      const map: Record<string, OffsiteUpload> = {};
      for (const u of uploadsRes.items) {
        map[u.run_id] = u;
      }
      setUploadsByRun(map);
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Failed to load backup history.', 'error');
    } finally {
      setLoading(false);
    }
  }, [canRead, jobFilter, showNotification]);

  useEffect(() => {
    void load();
  }, [load]);

  const jobOptions = useMemo(
    () => [
      { value: '', label: 'All jobs' },
      ...jobs.map((j) => ({ value: j.id, label: j.job_name })),
    ],
    [jobs]
  );

  const handleRunNow = async (jobId: string) => {
    if (!canManage) return;
    setRunningJobId(jobId);
    try {
      await backupSchedulerApi.runJob(jobId);
      showNotification('Backup job started and completed.', 'success');
      await load();
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Backup run failed.', 'error');
      await load();
    } finally {
      setRunningJobId(null);
    }
  };

  const handleCloudUpload = async (runId: string) => {
    if (!canManage) return;
    setCloudActionRunId(runId);
    try {
      await backupStorageApi.uploadRun(runId);
      showNotification('Cloud upload completed.', 'success');
      await load();
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Cloud upload failed.', 'error');
      await load();
    } finally {
      setCloudActionRunId(null);
    }
  };

  const handleCloudRetry = async (runId: string) => {
    if (!canManage) return;
    setCloudActionRunId(runId);
    try {
      await backupStorageApi.retryUpload(runId);
      showNotification('Cloud upload retry completed.', 'success');
      await load();
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Cloud retry failed.', 'error');
      await load();
    } finally {
      setCloudActionRunId(null);
    }
  };

  const handleRestoreFromCloud = async (runId: string) => {
    if (!canManage) return;
    if (
      !confirm(
        'Restore the entire PostgreSQL database from this cloud backup? All organizations on this server will be replaced. Continue?'
      )
    ) {
      return;
    }
    setCloudActionRunId(runId);
    try {
      const policy = await backupSecurityApi.getRestorePolicy();
      if (!policy.canRestore) {
        showNotification('Only Super Admin and Company Admin can restore backups.', 'error');
        return;
      }
      let restoreToken: string | undefined;
      if (policy.requireRestoreAuthorization) {
        const phrase = prompt(
          `Type "${policy.confirmPhrase}" to authorize restore:`,
          ''
        );
        if (!phrase) return;
        const auth = await backupSecurityApi.authorizeRestore(phrase);
        restoreToken = auth.restoreToken;
      }
      const res = await backupStorageApi.restoreFromCloud(runId, restoreToken);
      showNotification(res.message, 'success');
      setTimeout(() => window.location.reload(), 2500);
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Cloud restore failed.', 'error');
      setCloudActionRunId(null);
    }
  };

  const handleRetry = async (runId: string) => {
    if (!canManage) return;
    setRetryingRunId(runId);
    try {
      await backupSchedulerApi.retryRun(runId);
      showNotification('Backup retry completed.', 'success');
      await load();
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Retry failed.', 'error');
      await load();
    } finally {
      setRetryingRunId(null);
    }
  };

  if (!canRead) {
    return (
      <div className="p-4 sm:p-6">
        <div className={`max-w-4xl mx-auto ${backupAlertWarning} p-4 text-sm`}>
          You do not have permission to view backup history.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-app-text flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-ds-success" />
              Backup History
            </h3>
            <p className="text-sm text-app-muted mt-0.5">
              Scheduled full PostgreSQL backups — daily 02:00, weekly Sunday 01:00, monthly 1st 01:00
              (server local time).
            </p>
          </div>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className={`${backupAlertInfo} p-3 space-y-1`}>
          <p>
            Scheduler:{' '}
            <strong>{schedulerEnabled ? 'Active' : 'Inactive'}</strong>
            {!schedulerEnabled && ' — set ENABLE_DB_BACKUP_RESTORE and DATABASE_URL on the API server.'}
          </p>
          {storageRoot && (
            <p>
              Storage: <code className="bg-app-card/60 px-1 rounded">{storageRoot}</code>
            </p>
          )}
        </div>

        {jobs.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="rounded-lg border border-app-border bg-app-card p-3 shadow-ds-card"
              >
                <p className="font-medium text-app-text text-sm">{job.job_name}</p>
                <p className="text-xs text-app-muted capitalize mt-0.5">{job.frequency}</p>
                <div className="mt-2 text-xs text-app-muted space-y-1">
                  <p className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Next: {formatDateTime(job.next_run)}
                  </p>
                  <p className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Last: {formatDateTime(job.last_run)}
                  </p>
                  <p>
                    Status:{' '}
                    <span
                      className={
                        job.status === 'running'
                          ? 'text-primary'
                          : job.status === 'failed'
                            ? 'text-ds-danger'
                            : 'text-app-text'
                      }
                    >
                      {job.status}
                    </span>
                  </p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => void handleRunNow(job.id)}
                    disabled={runningJobId === job.id || job.status === 'running'}
                    className="mt-2 flex items-center gap-1 text-xs font-medium text-ds-success hover:text-ds-success/80 disabled:opacity-50"
                  >
                    <Play className="w-3 h-3" />
                    {runningJobId === job.id ? 'Running…' : 'Run now'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px]">
            <Select
              label="Filter by job"
              value={jobFilter}
              onChange={(e) => setJobFilter(e.target.value)}
            >
              {jobOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
          <p className="text-xs text-app-muted pb-2">{total} run(s) recorded</p>
        </div>

        <div className="border border-app-border rounded-lg overflow-hidden bg-app-card">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-app-bg border-b border-app-border">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-app-muted">Job</th>
                  <th className="text-left px-3 py-2 font-medium text-app-muted">Started</th>
                  <th className="text-left px-3 py-2 font-medium text-app-muted">Completed</th>
                  <th className="text-left px-3 py-2 font-medium text-app-muted">Duration</th>
                  <th className="text-left px-3 py-2 font-medium text-app-muted">Size</th>
                  <th className="text-left px-3 py-2 font-medium text-app-muted">Attempt</th>
                  <th className="text-left px-3 py-2 font-medium text-app-muted">Result</th>
                  <th className="text-left px-3 py-2 font-medium text-app-muted">Cloud</th>
                  <th className="text-left px-3 py-2 font-medium text-app-muted" />
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {loading && runs.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-app-muted">
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && runs.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-app-muted">
                      No backup runs yet.
                    </td>
                  </tr>
                )}
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-app-bg/80">
                    <td className="px-3 py-2 text-app-text">{run.job_name ?? run.job_id}</td>
                    <td className="px-3 py-2 text-app-muted whitespace-nowrap">
                      {formatDateTime(run.started_at)}
                    </td>
                    <td className="px-3 py-2 text-app-muted whitespace-nowrap">
                      {formatDateTime(run.completed_at)}
                    </td>
                    <td className="px-3 py-2 text-app-muted">{formatDuration(run.duration_ms)}</td>
                    <td className="px-3 py-2 text-app-muted">{formatBytes(run.size_bytes)}</td>
                    <td className="px-3 py-2 text-app-muted">{run.attempt_number}</td>
                    <td className="px-3 py-2">
                      {run.success ? (
                        <span className="inline-flex items-center gap-1 text-ds-success">
                          <CheckCircle className="w-4 h-4" />
                          Success
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-ds-danger"
                          title={run.failure_reason ?? undefined}
                        >
                          <XCircle className="w-4 h-4" />
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-app-muted">
                      {(() => {
                        const upload = uploadsByRun[run.id];
                        if (!upload) return run.success ? '—' : '—';
                        if (upload.status === 'completed') {
                          return (
                            <span className="inline-flex items-center gap-1 text-ds-success">
                              <Cloud className="w-3.5 h-3.5" />
                              Uploaded
                            </span>
                          );
                        }
                        if (upload.status === 'failed') {
                          return (
                            <span className="text-ds-danger" title={upload.failure_reason ?? undefined}>
                              Failed
                            </span>
                          );
                        }
                        return (
                          <span className="text-primary capitalize">{upload.status}</span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        {!run.success && canManage && (
                          <button
                            type="button"
                            onClick={() => void handleRetry(run.id)}
                            disabled={retryingRunId === run.id}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-50"
                          >
                            <RotateCcw className="w-3 h-3" />
                            {retryingRunId === run.id ? 'Retrying…' : 'Retry'}
                          </button>
                        )}
                        {run.success && canManage && (
                          <>
                            {(!uploadsByRun[run.id] || uploadsByRun[run.id].status === 'failed') && (
                              <button
                                type="button"
                                onClick={() =>
                                  void (uploadsByRun[run.id]?.status === 'failed'
                                    ? handleCloudRetry(run.id)
                                    : handleCloudUpload(run.id))
                                }
                                disabled={cloudActionRunId === run.id}
                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-50"
                              >
                                <CloudUpload className="w-3 h-3" />
                                {cloudActionRunId === run.id
                                  ? 'Uploading…'
                                  : uploadsByRun[run.id]?.status === 'failed'
                                    ? 'Retry cloud'
                                    : 'Upload'}
                              </button>
                            )}
                            {uploadsByRun[run.id]?.status === 'completed' && (
                              <button
                                type="button"
                                onClick={() => void handleRestoreFromCloud(run.id)}
                                disabled={cloudActionRunId === run.id}
                                className="inline-flex items-center gap-1 text-xs font-medium text-ds-warning hover:text-ds-warning disabled:opacity-50"
                              >
                                Restore cloud
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {runs.some((r) => !r.success && r.failure_reason) && (
          <div className={`${backupAlertError} p-3 text-xs`}>
            <p className="font-medium mb-1">Recent failures</p>
            <ul className="list-disc pl-4 space-y-1">
              {runs
                .filter((r) => !r.success && r.failure_reason)
                .slice(0, 5)
                .map((r) => (
                  <li key={`err-${r.id}`}>
                    {formatDateTime(r.started_at)} — {r.job_name}: {r.failure_reason}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default BackupHistoryPage;
