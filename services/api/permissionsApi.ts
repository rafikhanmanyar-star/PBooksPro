import { apiClient } from './client';
import type { Permission } from '../../shared/rbac/permissions';

export type MyPermissionsResponse = {
  role: string;
  enterpriseRole: string;
  enterpriseRoleLabel: string;
  permissions: Permission[];
};

export type PermissionMatrixResponse = {
  permissions: { key: Permission; label: string }[];
  roles: { role: string; label: string; permissions: Permission[] }[];
};

export const permissionsApi = {
  async getMyPermissions(): Promise<MyPermissionsResponse> {
    return apiClient.get<MyPermissionsResponse>('/permissions/me');
  },

  async getMatrix(): Promise<PermissionMatrixResponse> {
    return apiClient.get<PermissionMatrixResponse>('/permissions/matrix');
  },
};
