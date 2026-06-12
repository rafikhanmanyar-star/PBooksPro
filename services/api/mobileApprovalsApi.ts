import { apiClient } from './client';
import type { MobileApprovalItem } from '../../types/executiveMobile.types';

export async function fetchMobileApprovals(): Promise<MobileApprovalItem[]> {
  return apiClient.get<MobileApprovalItem[]>('/mobile/approvals');
}

export async function approveMobileItem(type: string, id: string): Promise<unknown> {
  return apiClient.post(`/mobile/approvals/${type}/${id}/approve`, {});
}

export async function rejectMobileItem(type: string, id: string, reason?: string): Promise<unknown> {
  return apiClient.post(`/mobile/approvals/${type}/${id}/reject`, { reason });
}
