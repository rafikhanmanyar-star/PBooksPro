import { apiClient } from './client';
import type { Permission } from '../../shared/rbac/permissions';

export type SecurityRoleSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: 'active' | 'inactive' | 'archived';
  roleType: 'system' | 'custom' | 'template_instance';
  systemRole: boolean;
  isProtected: boolean;
  userCount: number;
  permissionCount: number;
  version: number;
  roleVersionHash: string | null;
  templateId: string | null;
  archivedAt: string | null;
};

export type SecurityRoleDetail = SecurityRoleSummary & {
  permissions: (Permission | string)[];
};

export type RoleTemplateSummary = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  permissionCount: number;
};

export type RbacAuditEntry = {
  id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  target_user_id: string | null;
  target_role_id: string | null;
  reason: string | null;
  actor_user_id: string | null;
  created_at: string;
};

export const securityRbacApi = {
  listRoles(): Promise<SecurityRoleSummary[]> {
    return apiClient.get<SecurityRoleSummary[]>('/security/roles');
  },

  getRole(id: string): Promise<SecurityRoleDetail> {
    return apiClient.get<SecurityRoleDetail>(`/security/roles/${id}`);
  },

  createRole(body: {
    name: string;
    slug?: string;
    description?: string | null;
    status?: 'active' | 'inactive';
    permissions: string[];
  }): Promise<SecurityRoleDetail> {
    return apiClient.post<SecurityRoleDetail>('/security/roles', body);
  },

  updateRole(
    id: string,
    body: {
      name: string;
      description?: string | null;
      status: 'active' | 'inactive';
      permissions: string[];
      version: number;
    }
  ): Promise<SecurityRoleDetail> {
    return apiClient.put<SecurityRoleDetail>(`/security/roles/${id}`, body);
  },

  archiveRole(id: string, version: number): Promise<SecurityRoleDetail> {
    return apiClient.post<SecurityRoleDetail>(`/security/roles/${id}/archive`, { version });
  },

  restoreRole(id: string, version: number): Promise<SecurityRoleDetail> {
    return apiClient.post<SecurityRoleDetail>(`/security/roles/${id}/restore`, { version });
  },

  assignRole(roleId: string, userId: string) {
    return apiClient.post(`/security/roles/${roleId}/assign`, { userId });
  },

  unassignRole(roleId: string, userId: string) {
    return apiClient.post(`/security/roles/${roleId}/unassign`, { userId });
  },

  listTemplates(): Promise<RoleTemplateSummary[]> {
    return apiClient.get<RoleTemplateSummary[]>('/security/templates');
  },

  instantiateTemplate(templateId: string, body: { name: string; slug?: string }) {
    return apiClient.post<SecurityRoleDetail>(`/security/templates/${templateId}/instantiate`, body);
  },

  listAudit(): Promise<RbacAuditEntry[]> {
    return apiClient.get<RbacAuditEntry[]>('/security/roles-audit');
  },
};

export function isRbacV2RoleManagementUiEnabled(): boolean {
  return import.meta.env.VITE_RBAC_V2_ROLE_MANAGEMENT === 'true';
}
