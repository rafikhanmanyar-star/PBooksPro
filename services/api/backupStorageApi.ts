import { apiClient } from './client';

export type StorageProviderId = 'aws_s3' | 'cloudflare_r2' | 'backblaze_b2' | 'azure_blob';

export type BackupStorageSettings = {
  id: string;
  provider: StorageProviderId;
  providerLabel: string;
  bucketName: string;
  region: string | null;
  endpointUrl: string | null;
  enabled: boolean;
  autoUpload: boolean;
  accessKeyMasked: string;
  secretKeyMasked: string;
  hasAccessKey: boolean;
  hasSecretKey: boolean;
  updatedAt: string;
};

export type OffsiteUpload = {
  id: string;
  run_id: string;
  object_key: string;
  provider: string;
  status: 'pending' | 'uploading' | 'verifying' | 'completed' | 'failed';
  local_sha256: string | null;
  remote_sha256: string | null;
  remote_etag: string | null;
  encrypted: boolean;
  size_bytes: string | null;
  started_at: string | null;
  completed_at: string | null;
  failure_reason: string | null;
  attempt_number: number;
  created_at: string;
  updated_at: string;
};

export type SaveStorageSettingsPayload = {
  provider: StorageProviderId;
  bucketName: string;
  region?: string | null;
  endpointUrl?: string | null;
  enabled?: boolean;
  autoUpload?: boolean;
  accessKey?: string;
  secretKey?: string;
};

export const backupStorageApi = {
  async getSettings(): Promise<{ settings: BackupStorageSettings; endpointHint: string }> {
    return apiClient.get('/backups/storage/settings');
  },

  async saveSettings(payload: SaveStorageSettingsPayload): Promise<{ settings: BackupStorageSettings }> {
    return apiClient.put('/backups/storage/settings', payload);
  },

  async testConnection(payload?: SaveStorageSettingsPayload): Promise<{ ok: boolean; message: string }> {
    return apiClient.post('/backups/storage/test', payload ?? {});
  },

  async listUploads(runId?: string): Promise<{ items: OffsiteUpload[]; count: number }> {
    const q = runId ? `?runId=${encodeURIComponent(runId)}` : '';
    return apiClient.get(`/backups/offsite/uploads${q}`);
  },

  async uploadRun(runId: string): Promise<OffsiteUpload> {
    return apiClient.post(`/backups/runs/${encodeURIComponent(runId)}/offsite/upload`, {});
  },

  async retryUpload(runId: string): Promise<OffsiteUpload> {
    return apiClient.post(`/backups/runs/${encodeURIComponent(runId)}/offsite/retry`, {});
  },

  async restoreFromCloud(
    runId: string,
    restoreToken?: string
  ): Promise<{ ok: boolean; message: string }> {
    return apiClient.post(`/backups/runs/${encodeURIComponent(runId)}/restore-from-cloud`, {
      restoreToken,
    });
  },
};

export const STORAGE_PROVIDER_OPTIONS: { value: StorageProviderId; label: string }[] = [
  { value: 'aws_s3', label: 'AWS S3' },
  { value: 'cloudflare_r2', label: 'Cloudflare R2' },
  { value: 'backblaze_b2', label: 'Backblaze B2' },
  { value: 'azure_blob', label: 'Azure Blob Storage' },
];
