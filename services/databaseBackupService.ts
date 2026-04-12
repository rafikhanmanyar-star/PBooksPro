/**
 * Full PostgreSQL backup/restore via LAN API (pg_dump / pg_restore on the server).
 */

import { apiClient, formatApiErrorMessage } from './api/client';

export interface DatabaseBackupCapabilities {
  backupRestoreEnabled: boolean;
  format: string;
  fileExtension: string;
  hint: string;
}

export async function fetchDatabaseBackupCapabilities(): Promise<DatabaseBackupCapabilities> {
  return apiClient.get<DatabaseBackupCapabilities>('/database/backup/capabilities');
}

function parseJsonError(text: string): string {
  try {
    const j = JSON.parse(text) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (j.error && typeof j.error === 'object' && typeof j.error.message === 'string') return j.error.message;
    if (typeof j.error === 'string') return j.error;
    if (typeof j.message === 'string') return j.message;
  } catch {
    /* ignore */
  }
  return text || 'Request failed';
}

export async function downloadPostgresBackup(): Promise<void> {
  const base = apiClient.getBaseUrl().replace(/\/$/, '');
  const token = apiClient.getToken();
  if (!token) throw new Error('Not authenticated');

  const headers: HeadersInit = { Authorization: `Bearer ${token}` };
  const tid = apiClient.getTenantId();
  if (tid) (headers as Record<string, string>)['X-Tenant-ID'] = tid;

  const controller = new AbortController();
  const timeoutMs = 600_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}/database/backup`, { method: 'GET', headers, signal: controller.signal });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(parseJsonError(text) || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition');
    let filename = 'pbooks-backup.dump';
    const m = cd?.match(/filename="([^"]+)"/i) || cd?.match(/filename=([^;\s]+)/i);
    if (m) filename = m[1].trim();

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Backup timed out. If the database is very large, try again or run pg_dump on the server.');
    }
    throw e instanceof Error ? e : new Error(formatApiErrorMessage(e));
  } finally {
    clearTimeout(timer);
  }
}

export async function restorePostgresBackup(file: File): Promise<string> {
  const base = apiClient.getBaseUrl().replace(/\/$/, '');
  const token = apiClient.getToken();
  if (!token) throw new Error('Not authenticated');

  const headers: HeadersInit = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/octet-stream',
  };
  const tid = apiClient.getTenantId();
  if (tid) (headers as Record<string, string>)['X-Tenant-ID'] = tid;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 600_000);

  try {
    const res = await fetch(`${base}/database/restore`, {
      method: 'POST',
      headers,
      body: file,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(parseJsonError(text) || `HTTP ${res.status}`);
    }
    let message = 'Database restored.';
    try {
      const j = JSON.parse(text) as { success?: boolean; data?: { message?: string } };
      if (j.success && j.data?.message) message = j.data.message;
    } catch {
      /* ignore */
    }
    return message;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Restore timed out.');
    }
    throw e instanceof Error ? e : new Error(formatApiErrorMessage(e));
  } finally {
    clearTimeout(timer);
  }
}
