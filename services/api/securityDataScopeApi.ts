import { apiClient } from './client';

export type ScopeDimension = 'project' | 'property' | 'owner' | 'department';

export type UserScopeDimensionSummary = {
  dimension: ScopeDimension;
  mode: 'all' | 'assigned';
  entityIds: string[];
  rows: { id: string; entityId: string | null }[];
};

export type UserScopeSummary = {
  userId: string;
  scopes: UserScopeDimensionSummary[];
};

export function isRbacV2DataScopeUiEnabled(): boolean {
  return import.meta.env.VITE_RBAC_V2_DATA_SCOPE === 'true';
}

export const dataScopeApi = {
  async getUserScopes(userId: string): Promise<UserScopeSummary> {
    return apiClient.get<UserScopeSummary>(`/rbac/scopes/users/${encodeURIComponent(userId)}`);
  },

  async assignUserScope(input: {
    userId: string;
    dimension: ScopeDimension;
    mode: 'all' | 'assigned';
    entityIds?: string[];
    reason?: string;
  }): Promise<UserScopeSummary> {
    return apiClient.put<UserScopeSummary>(
      `/rbac/scopes/users/${encodeURIComponent(input.userId)}`,
      input
    );
  },

  async removeScope(scopeId: string, reason?: string): Promise<UserScopeSummary> {
    return apiClient.delete<UserScopeSummary>(`/rbac/scopes/${encodeURIComponent(scopeId)}`, {
      data: reason ? { reason } : undefined,
    });
  },
};
