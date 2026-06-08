import { apiClient } from './client';

export type BackupJob = {
  id: string;
  job_name: string;
  backup_type: 'full_pg' | 'tenant';
  frequency: 'daily' | 'weekly' | 'monthly';
  last_run: string | null;
  next_run: string;
  status: 'idle' | 'running' | 'failed' | 'disabled';
  retention_days: number;
  storage_location: string;
  created_at: string;
  updated_at: string;
};

export type BackupJobRun = {
  id: string;
  job_id: string;
  started_at: string;
  completed_at: string | null;
  size_bytes: string | null;
  duration_ms: number | null;
  success: boolean;
  failure_reason: string | null;
  storage_path: string | null;
  attempt_number: number;
  created_at: string;
  job_name?: string;
  backup_type?: string;
  frequency?: string;
};

export type BackupSchedulerStatus = {
  schedulerEnabled: boolean;
  pgBackupAvailable: boolean;
  backupRestoreEnabled: boolean;
  storageRoot: string;
};

export const backupSchedulerApi = {
  async getStatus(): Promise<BackupSchedulerStatus> {
    return apiClient.get<BackupSchedulerStatus>('/backups/scheduler/status');
  },

  async listJobs(): Promise<{ items: BackupJob[]; count: number }> {
    return apiClient.get<{ items: BackupJob[]; count: number }>('/backups/jobs');
  },

  async listHistory(filters: {
    jobId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ items: BackupJobRun[]; total: number }> {
    const q = new URLSearchParams();
    if (filters.jobId) q.set('jobId', filters.jobId);
    if (filters.limit != null) q.set('limit', String(filters.limit));
    if (filters.offset != null) q.set('offset', String(filters.offset));
    const qs = q.toString();
    return apiClient.get<{ items: BackupJobRun[]; total: number }>(
      `/backups/history${qs ? `?${qs}` : ''}`
    );
  },

  async runJob(jobId: string): Promise<BackupJobRun> {
    return apiClient.post<BackupJobRun>(`/backups/jobs/${encodeURIComponent(jobId)}/run`, {});
  },

  async retryRun(runId: string): Promise<BackupJobRun> {
    return apiClient.post<BackupJobRun>(`/backups/runs/${encodeURIComponent(runId)}/retry`, {});
  },
};
