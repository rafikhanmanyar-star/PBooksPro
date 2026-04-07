/**
 * Record edit locks API (multi-user ERP).
 */

import { apiClient } from './client';

export type RecordLockType = 'agreement' | 'invoice';

export type LockAcquireResponse =
  | { locked: true; lockedBy: string; lockedByUserId?: string }
  | { locked: false; success: true; expiresAt?: string };

export type LockStatusResponse =
  | { success: true; locked: false }
  | {
      success: true;
      locked: true;
      lockedBy: string;
      lockedByUserId: string;
      lockedAt?: string;
      expiresAt?: string;
    };

export async function acquireRecordLock(recordType: RecordLockType, recordId: string): Promise<LockAcquireResponse> {
  return apiClient.post<LockAcquireResponse>('/locks/acquire', { recordType, recordId });
}

export async function releaseRecordLock(recordType: RecordLockType, recordId: string): Promise<{ success?: boolean }> {
  return apiClient.post('/locks/release', { recordType, recordId });
}

export async function refreshRecordLock(recordType: RecordLockType, recordId: string): Promise<{ success?: boolean; expiresAt?: string }> {
  return apiClient.post('/locks/refresh', { recordType, recordId });
}

export async function forceRecordLock(recordType: RecordLockType, recordId: string): Promise<{
  success?: boolean;
  expiresAt?: string;
  previousHolderName?: string | null;
  previousHolderId?: string | null;
}> {
  return apiClient.post('/locks/force', { recordType, recordId });
}

export async function getRecordLockStatus(recordType: RecordLockType, recordId: string): Promise<LockStatusResponse> {
  const q = new URLSearchParams({ recordType, recordId });
  return apiClient.get<LockStatusResponse>(`/locks/status?${q.toString()}`);
}
