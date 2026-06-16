import { apiClient } from './client';
import type { Permission } from '../../shared/rbac/permissions';

export type RbacRoleSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: 'active' | 'inactive';
  isSystem: boolean;
  isProtected: boolean;
  userCount: number;
  permissionCount: number;
  version: number;
};

export type RbacRoleDetail = RbacRoleSummary & {
  permissions: Permission[];
};

export type PermissionCatalogResponse = {
  groups: {
    module: string;
    label: string;
    permissions: { key: Permission; label: string }[];
  }[];
  permissions: {
    key: Permission;
    label: string;
    roles: { id: string; slug: string; name: string }[];
  }[];
};

export type UserRoleAssignment = {
  user_id: string;
  role_id: string;
  assigned_at: string;
  assigned_by: string | null;
  slug: string;
  name: string;
};

export const rbacApi = {
  listRoles(): Promise<RbacRoleSummary[]> {
    return apiClient.get<RbacRoleSummary[]>('/rbac/roles');
  },

  getRole(id: string): Promise<RbacRoleDetail> {
    return apiClient.get<RbacRoleDetail>(`/rbac/roles/${id}`);
  },

  createRole(body: {
    name: string;
    slug?: string;
    description?: string | null;
    status?: 'active' | 'inactive';
    permissions: Permission[];
  }): Promise<RbacRoleDetail> {
    return apiClient.post<RbacRoleDetail>('/rbac/roles', body);
  },

  updateRole(
    id: string,
    body: {
      name: string;
      description?: string | null;
      status: 'active' | 'inactive';
      permissions: Permission[];
      version: number;
    }
  ): Promise<RbacRoleDetail> {
    return apiClient.put<RbacRoleDetail>(`/rbac/roles/${id}`, body);
  },

  duplicateRole(id: string, name: string): Promise<RbacRoleDetail> {
    return apiClient.post<RbacRoleDetail>(`/rbac/roles/${id}/duplicate`, { name });
  },

  deleteRole(id: string): Promise<{ deleted: boolean }> {
    return apiClient.delete<{ deleted: boolean }>(`/rbac/roles/${id}`);
  },

  getPermissionCatalog(): Promise<PermissionCatalogResponse> {
    return apiClient.get<PermissionCatalogResponse>('/rbac/permission-catalog');
  },

  getUserRoles(userId: string): Promise<UserRoleAssignment[]> {
    return apiClient.get<UserRoleAssignment[]>(`/rbac/users/${userId}/roles`);
  },

  setUserRoles(userId: string, roleIds: string[]): Promise<UserRoleAssignment[]> {
    return apiClient.put<UserRoleAssignment[]>(`/rbac/users/${userId}/roles`, { roleIds });
  },
};
