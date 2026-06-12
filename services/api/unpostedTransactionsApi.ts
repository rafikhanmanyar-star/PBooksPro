import { apiClient } from './client';
import type { UnpostedTransaction, UnpostedTransactionStatus } from '../../types/executiveMobile.types';

export type CreateUnpostedTransactionPayload = {
  transactionDate?: string;
  amount: number;
  currency?: string;
  transactionType: string;
  description?: string;
  partyName?: string;
  supplierId?: string;
  employeeId?: string;
  customerId?: string;
  projectId?: string;
  propertyId?: string;
  costCenterCode?: string;
  source?: 'EXECUTIVE_APP' | 'DESKTOP' | 'API';
  status?: 'draft' | 'submitted';
};

export async function listUnpostedTransactions(options?: {
  status?: UnpostedTransactionStatus | UnpostedTransactionStatus[];
  mine?: boolean;
  limit?: number;
  offset?: number;
}): Promise<UnpostedTransaction[]> {
  const params = new URLSearchParams();
  if (options?.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    params.set('status', statuses.join(','));
  }
  if (options?.mine) params.set('mine', 'true');
  if (options?.limit != null) params.set('limit', String(options.limit));
  if (options?.offset != null) params.set('offset', String(options.offset));
  const qs = params.toString();
  return apiClient.get<UnpostedTransaction[]>(`/mobile/unposted-transactions${qs ? `?${qs}` : ''}`);
}

export async function getUnpostedTransactionCounts(): Promise<Record<string, number>> {
  return apiClient.get<Record<string, number>>('/mobile/unposted-transactions/counts');
}

export async function createUnpostedTransaction(
  payload: CreateUnpostedTransactionPayload
): Promise<UnpostedTransaction> {
  return apiClient.post<UnpostedTransaction>('/mobile/unposted-transactions', payload);
}

export async function updateUnpostedTransactionStatus(
  id: string,
  status: UnpostedTransactionStatus,
  rejectionReason?: string
): Promise<UnpostedTransaction> {
  return apiClient.patch<UnpostedTransaction>(`/mobile/unposted-transactions/${id}/status`, {
    status,
    rejectionReason,
  });
}

export async function uploadUnpostedAttachment(
  transactionId: string,
  file: { fileName: string; mimeType: string; fileData: string; name?: string }
): Promise<void> {
  await apiClient.post('/documents', {
    name: file.name ?? file.fileName,
    type: 'receipt',
    entityType: 'unposted_transaction',
    entityId: transactionId,
    fileName: file.fileName,
    mimeType: file.mimeType,
    fileData: file.fileData,
    fileSize: Math.ceil((file.fileData.length * 3) / 4),
  });
}
