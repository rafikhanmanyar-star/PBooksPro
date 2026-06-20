import { apiClient } from './client';

export type ApprovalEntityType =
  | 'manual_journal'
  | 'journal_reversal'
  | 'bill'
  | 'payment'
  | 'purchase_order'
  | 'payroll_run'
  | 'rental_agreement';

export type ApprovalMatrixSummary = {
  capabilities: Array<{
    id: string;
    capability_key: string;
    entity_type: ApprovalEntityType;
    required_permission: string;
    max_level: number;
    is_active: boolean;
  }>;
  rules: Array<{
    id: string;
    entity_type: ApprovalEntityType;
    priority: number;
    approval_level: number;
    min_approvers: number;
    allow_self_approval: boolean;
    required_permission: string;
    conditions: Record<string, unknown>;
    is_mandatory: boolean;
    is_active: boolean;
  }>;
  assignments: Array<{
    id: string;
    rule_id: string | null;
    capability_id: string | null;
    assignee_type: 'user' | 'role';
    assignee_id: string;
    approval_level: number;
    is_active: boolean;
  }>;
};

export function isRbacV2ApprovalMatrixUiEnabled(): boolean {
  return import.meta.env.VITE_RBAC_V2_APPROVAL_MATRIX === 'true';
}

export const approvalMatrixApi = {
  async getMatrix(): Promise<ApprovalMatrixSummary> {
    const res = await apiClient.get<ApprovalMatrixSummary>('/rbac/approval-matrix');
    return res.data;
  },

  async getUserCapabilities(userId: string): Promise<{
    userId: string;
    approvalCapabilities: Array<{
      capabilityKey: string;
      entityType: ApprovalEntityType;
      requiredPermission: string;
      maxLevel: number;
    }>;
  }> {
    const res = await apiClient.get(`/rbac/approval-matrix/users/${encodeURIComponent(userId)}/capabilities`);
    return res.data;
  },

  async upsertRule(input: {
    id?: string;
    entityType: ApprovalEntityType;
    priority?: number;
    approvalLevel?: number;
    minApprovers?: number;
    allowSelfApproval?: boolean;
    requiredPermission: string;
    conditions?: Record<string, unknown>;
    isActive?: boolean;
  }): Promise<ApprovalMatrixSummary> {
    const res = await apiClient.put<ApprovalMatrixSummary>('/rbac/approval-matrix/rules', input);
    return res.data;
  },

  async createAssignment(input: {
    ruleId?: string;
    capabilityId?: string;
    assigneeType: 'user' | 'role';
    assigneeId: string;
    approvalLevel?: number;
    reason?: string;
  }): Promise<ApprovalMatrixSummary> {
    const res = await apiClient.post<ApprovalMatrixSummary>('/rbac/approval-matrix/assignments', input);
    return res.data;
  },

  async removeAssignment(assignmentId: string, reason?: string): Promise<ApprovalMatrixSummary> {
    const res = await apiClient.delete<ApprovalMatrixSummary>(
      `/rbac/approval-matrix/assignments/${encodeURIComponent(assignmentId)}`,
      { data: reason ? { reason } : undefined }
    );
    return res.data;
  },
};
