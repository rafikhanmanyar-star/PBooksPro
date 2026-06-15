import { apiClient } from './client';
import type { BulkApprovalResult, ExecutiveCommandCenterResponse } from '../../types/executiveMobile.types';

export async function fetchMobileCommandCenter(): Promise<ExecutiveCommandCenterResponse> {
  return apiClient.get<ExecutiveCommandCenterResponse>('/mobile/command-center');
}

export async function bulkApproveMobileItems(
  items: Array<{ type: string; id: string }>
): Promise<BulkApprovalResult> {
  return apiClient.post<BulkApprovalResult>('/mobile/approvals/bulk-approve', { items });
}
