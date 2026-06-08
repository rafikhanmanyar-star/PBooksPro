import { apiClient } from './client';

export type BackupSecuritySettings = {
  encrypt_at_rest: boolean;
  encrypt_before_upload: boolean;
  require_restore_authorization: boolean;
  min_backup_password_length: number;
  key_version: number;
  key_rotated_at: string | null;
  updated_at: string;
};

export type BackupSecurityStatus = {
  settings: BackupSecuritySettings;
  serverKeyConfigured: boolean;
  storageMasterKeyConfigured: boolean;
  encryptionAlgorithm: 'AES-256-GCM';
  formats: string[];
};

export type RestorePolicy = {
  canRestore: boolean;
  requireRestoreAuthorization: boolean;
  confirmPhrase: string;
  role: string | null;
};

export type RestoreAuthorization = {
  restoreToken: string;
  expiresAt: string;
};

export const backupSecurityApi = {
  async getStatus(): Promise<BackupSecurityStatus> {
    return apiClient.get<BackupSecurityStatus>('/backups/security/status');
  },

  async getSettings(): Promise<BackupSecuritySettings> {
    return apiClient.get<BackupSecuritySettings>('/backups/security/settings');
  },

  async updateSettings(
    patch: Partial<
      Pick<
        BackupSecuritySettings,
        | 'encrypt_at_rest'
        | 'encrypt_before_upload'
        | 'require_restore_authorization'
        | 'min_backup_password_length'
      >
    >
  ): Promise<BackupSecuritySettings> {
    return apiClient.put<BackupSecuritySettings>('/backups/security/settings', patch);
  },

  async rotateKey(): Promise<{ settings: BackupSecuritySettings; message: string }> {
    return apiClient.post<{ settings: BackupSecuritySettings; message: string }>(
      '/backups/security/rotate-key',
      {}
    );
  },

  async getRestorePolicy(): Promise<RestorePolicy> {
    return apiClient.get<RestorePolicy>('/backups/security/restore-policy');
  },

  async authorizeRestore(confirmPhrase: string): Promise<RestoreAuthorization> {
    return apiClient.post<RestoreAuthorization>('/backups/security/restore/authorize', {
      confirmPhrase,
    });
  },
};
