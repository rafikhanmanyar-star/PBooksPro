import { apiClient } from './client';

export type HealthFactor = {
  id: string;
  label: string;
  weight: number;
  score: number;
  maxScore: number;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
};

export type DrDashboard = {
  lastBackup: {
    runId: string;
    at: string;
    jobName: string | null;
    success: boolean;
    sizeBytes: string | null;
  } | null;
  lastSuccessfulBackup: {
    runId: string;
    at: string;
    jobName: string | null;
    sizeBytes: string | null;
  } | null;
  lastRestoreTest: {
    id: string;
    at: string;
    testType: string;
    status: string;
  } | null;
  backupSizeBytes: string | null;
  backupHealth: {
    score: number;
    label: 'healthy' | 'degraded' | 'critical';
    factors: HealthFactor[];
  };
  storageUsage: {
    localBytes: number;
    offsiteBytes: number;
    totalBytes: number;
    localPath: string;
    fileCount: number;
  };
};

export type DrVerificationRun = {
  id: string;
  backup_run_id: string | null;
  status: string;
  integrity_score: number | null;
  sha256: string | null;
  pg_restore_list_ok: boolean | null;
  toc_entry_count: number | null;
  issues: unknown[];
  started_at: string;
  completed_at: string | null;
  failure_reason: string | null;
};

export type DrRestoreTest = {
  id: string;
  backup_run_id: string | null;
  test_type: string;
  status: string;
  duration_ms: number | null;
  simulation_details: Record<string, unknown> | null;
  failure_reason: string | null;
  started_at: string;
  completed_at: string | null;
};

export type DrAlert = {
  id: string;
  alert_type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  acknowledged: boolean;
  email_sent: boolean;
  created_at: string;
};

export type DrNotificationSettings = {
  enabled: boolean;
  email_recipients: string[];
  alert_on_backup_failure: boolean;
  alert_on_verification_failure: boolean;
  alert_on_stale_backup: boolean;
  stale_backup_hours: number;
};

export type DrReport = {
  id: string;
  report_type: string;
  health_score: number;
  summary: Record<string, unknown>;
  generated_at: string;
};

export const disasterRecoveryApi = {
  async getDashboard(): Promise<DrDashboard> {
    return apiClient.get<DrDashboard>('/dr/dashboard');
  },

  async verifyLatest(): Promise<DrVerificationRun> {
    return apiClient.post<DrVerificationRun>('/dr/verify/latest', {});
  },

  async verifyRun(runId: string): Promise<DrVerificationRun> {
    return apiClient.post<DrVerificationRun>(`/dr/verify/${encodeURIComponent(runId)}`, {});
  },

  async listVerificationHistory(): Promise<{ items: DrVerificationRun[]; count: number }> {
    return apiClient.get<{ items: DrVerificationRun[]; count: number }>('/dr/verification/history');
  },

  async runRestoreTestLatest(testType: 'simulation' | 'recovery' = 'simulation'): Promise<DrRestoreTest> {
    return apiClient.post<DrRestoreTest>('/dr/restore-test/latest', { testType });
  },

  async listRestoreTests(): Promise<{ items: DrRestoreTest[]; count: number }> {
    return apiClient.get<{ items: DrRestoreTest[]; count: number }>('/dr/restore-tests/history');
  },

  async listAlerts(acknowledged?: boolean): Promise<{ items: DrAlert[]; count: number }> {
    const q =
      acknowledged === undefined ? '' : `?acknowledged=${acknowledged ? 'true' : 'false'}`;
    return apiClient.get<{ items: DrAlert[]; count: number }>(`/dr/alerts${q}`);
  },

  async acknowledgeAlert(alertId: string): Promise<DrAlert> {
    return apiClient.post<DrAlert>(`/dr/alerts/${encodeURIComponent(alertId)}/acknowledge`, {});
  },

  async getNotificationSettings(): Promise<DrNotificationSettings> {
    return apiClient.get<DrNotificationSettings>('/dr/notifications/settings');
  },

  async updateNotificationSettings(
    patch: Partial<DrNotificationSettings>
  ): Promise<DrNotificationSettings> {
    return apiClient.put<DrNotificationSettings>('/dr/notifications/settings', patch);
  },

  async generateReport(reportType: 'manual' | 'daily_health' | 'weekly' = 'manual'): Promise<DrReport> {
    return apiClient.post<DrReport>('/dr/reports/generate', { reportType });
  },

  async listReports(): Promise<{ items: DrReport[]; count: number }> {
    return apiClient.get<{ items: DrReport[]; count: number }>('/dr/reports');
  },

  async getReport(reportId: string): Promise<DrReport> {
    return apiClient.get<DrReport>(`/dr/reports/${encodeURIComponent(reportId)}`);
  },
};
