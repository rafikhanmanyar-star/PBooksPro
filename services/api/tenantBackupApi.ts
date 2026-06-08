import { apiClient } from './client';

export type RestoreMode = 'existing_tenant' | 'new_tenant';
export type ConflictPolicy = 'replace' | 'skip' | 'merge';

export type ValidationIssue = {
  severity: 'error' | 'warning' | 'info';
  table: string;
  recordId?: string;
  code: string;
  message: string;
};

export type TableRestoreSummary = {
  table: string;
  total: number;
  toInsert: number;
  toUpdate: number;
  toSkip: number;
  crossTenantConflicts: number;
};

export type RestorePreview = {
  sourceTenantId: string;
  sourceTenantName?: string;
  exportedAt: string;
  mode: RestoreMode;
  targetTenantId: string;
  targetTenantName?: string;
  conflictPolicy: ConflictPolicy;
  tableSummaries: TableRestoreSummary[];
  issues: ValidationIssue[];
  canProceed: boolean;
  totalRecords: number;
};

export type RestoreResult = {
  restoreRunId: string;
  targetTenantId: string;
  targetTenantName?: string;
  mode: RestoreMode;
  tableSummaries: TableRestoreSummary[];
  issues: ValidationIssue[];
};

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export const tenantBackupApi = {
  async validateRestore(params: {
    file: File;
    mode: RestoreMode;
    conflictPolicy: ConflictPolicy;
    newTenantName?: string;
    targetTenantId?: string;
  }): Promise<RestorePreview> {
    const backupBase64 = await fileToBase64(params.file);
    return apiClient.post<RestorePreview>('/backups/tenant/validate', {
      backupBase64,
      mode: params.mode,
      conflictPolicy: params.conflictPolicy,
      newTenantName: params.newTenantName,
      targetTenantId: params.targetTenantId,
    });
  },

  async executeRestore(params: {
    file: File;
    mode: RestoreMode;
    conflictPolicy: ConflictPolicy;
    newTenantName?: string;
    targetTenantId?: string;
    restoreToken?: string;
  }): Promise<RestoreResult> {
    const backupBase64 = await fileToBase64(params.file);
    return apiClient.post<RestoreResult>('/backups/tenant/restore', {
      backupBase64,
      mode: params.mode,
      conflictPolicy: params.conflictPolicy,
      newTenantName: params.newTenantName,
      targetTenantId: params.targetTenantId,
      restoreToken: params.restoreToken,
      confirm: true,
    });
  },

  async getRestoreHistory(): Promise<{ items: unknown[]; count: number }> {
    return apiClient.get('/backups/tenant/restore/history');
  },
};
