import { apiClient } from './api/client';

export type WorkflowRule = {
  id: string;
  type: 'amount' | 'department' | 'project' | 'entity' | 'role';
  level: 1 | 2 | 3;
  enabled?: boolean;
  minAmount?: number;
  maxAmount?: number;
  departmentId?: string;
  projectId?: string;
  entityType?: string;
  role?: string;
};

export type WorkflowConfig = {
  levels: 1 | 2 | 3;
  rules: WorkflowRule[];
};

export type WorkflowSettings = {
  approvalWorkflowEnabled: boolean;
  workflowConfig: WorkflowConfig;
  updatedAt?: string;
};

export type ApprovalRequest = {
  id: string;
  entityType: string;
  entityId: string;
  entityRef?: string;
  requesterId?: string;
  status: string;
  currentLevel: number;
  maxLevel: number;
  amount?: number;
  departmentId?: string;
  projectId?: string;
  previousStatus?: string;
  targetStatus?: string;
  assignedApproverId?: string;
  comments?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
};

export async function fetchWorkflowSettings(): Promise<WorkflowSettings> {
  return apiClient.get<WorkflowSettings>('/workflow/settings');
}

export async function updateWorkflowSettings(body: Partial<WorkflowSettings>): Promise<WorkflowSettings> {
  return apiClient.put<WorkflowSettings>('/workflow/settings', body);
}

export async function fetchApprovalQueue(params?: {
  status?: string;
  entityType?: string;
  mine?: boolean;
}): Promise<ApprovalRequest[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.entityType) qs.set('entityType', params.entityType);
  if (params?.mine) qs.set('mine', 'true');
  const suffix = qs.toString() ? `?${qs}` : '';
  return apiClient.get<ApprovalRequest[]>(`/workflow/queue${suffix}`);
}

export async function performApprovalAction(
  requestId: string,
  body: {
    action: 'approve' | 'reject' | 'return' | 'delegate' | 'escalate';
    comments?: string;
    delegateToUserId?: string;
  }
): Promise<ApprovalRequest> {
  return apiClient.post<ApprovalRequest>(`/workflow/requests/${requestId}/action`, body);
}

export async function submitEntityForApproval(body: {
  entityType: string;
  entityId: string;
  comments?: string;
}): Promise<{ mode: string; request?: ApprovalRequest }> {
  return apiClient.post('/workflow/submit', body);
}

export async function submitBillForApproval(id: string, version?: number) {
  return apiClient.post<Record<string, unknown>>(`/bills/${id}/submit`, { version });
}

export async function submitContractForApproval(id: string, version?: number) {
  return apiClient.post<Record<string, unknown>>(`/contracts/${id}/submit`, { version });
}

export async function submitPaymentForApproval(id: string, version?: number) {
  return apiClient.post<Record<string, unknown>>(`/transactions/${id}/submit`, { version });
}
