import { randomUUID } from 'crypto';
import { storedRoleLabelForEnterpriseSlug } from '../../../auth/permissions.js';
import { TenantRepository } from '../../../core/TenantRepository.js';

export type RbacRoleRow = {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  description: string | null;
  status: 'active' | 'inactive';
  is_system: boolean;
  is_protected: boolean;
  is_hidden: boolean;
  version: number;
  created_at: Date;
  updated_at: Date;
};

export type RbacRoleListRow = RbacRoleRow & {
  user_count: number;
  permission_count: number;
};

export type RbacUserRoleRow = {
  user_id: string;
  role_id: string;
  assigned_at: Date;
  assigned_by: string | null;
  slug: string;
  name: string;
};

export class RbacRepository extends TenantRepository {
  async listVisibleRoles(): Promise<RbacRoleListRow[]> {
    const r = await this.query<RbacRoleListRow>(
      `SELECT r.*,
              COALESCE(uc.cnt, 0)::int AS user_count,
              COALESCE(pc.cnt, 0)::int AS permission_count
       FROM rbac_roles r
       LEFT JOIN (
         SELECT role_id, COUNT(*)::int AS cnt
         FROM rbac_user_roles
         WHERE tenant_id = $1
         GROUP BY role_id
       ) uc ON uc.role_id = r.id
       LEFT JOIN (
         SELECT role_id, COUNT(*)::int AS cnt
         FROM rbac_role_permissions
         WHERE tenant_id = $1
         GROUP BY role_id
       ) pc ON pc.role_id = r.id
       WHERE r.tenant_id = $1 AND r.is_hidden = FALSE
       ORDER BY LOWER(r.name)`,
      [this.tenantId]
    );
    return r.rows;
  }

  async getRoleById(roleId: string, includeHidden = false): Promise<RbacRoleRow | null> {
    const hiddenClause = includeHidden ? '' : ' AND is_hidden = FALSE';
    return this.queryOne<RbacRoleRow>(
      `SELECT * FROM rbac_roles WHERE tenant_id = $1 AND id = $2${hiddenClause}`,
      [this.tenantId, roleId]
    );
  }

  async getRoleBySlug(slug: string, includeHidden = false): Promise<RbacRoleRow | null> {
    const hiddenClause = includeHidden ? '' : ' AND is_hidden = FALSE';
    return this.queryOne<RbacRoleRow>(
      `SELECT * FROM rbac_roles WHERE tenant_id = $1 AND slug = $2${hiddenClause}`,
      [this.tenantId, slug]
    );
  }

  async listRolePermissionKeys(roleId: string): Promise<string[]> {
    const r = await this.query<{ permission_key: string }>(
      `SELECT permission_key FROM rbac_role_permissions
       WHERE tenant_id = $1 AND role_id = $2
       ORDER BY permission_key`,
      [this.tenantId, roleId]
    );
    return r.rows.map((row) => row.permission_key);
  }

  async listUserRoleAssignments(userId: string): Promise<RbacUserRoleRow[]> {
    const r = await this.query<RbacUserRoleRow>(
      `SELECT ur.user_id, ur.role_id, ur.assigned_at, ur.assigned_by, r.slug, r.name
       FROM rbac_user_roles ur
       INNER JOIN rbac_roles r ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id
       WHERE ur.tenant_id = $1 AND ur.user_id = $2`,
      [this.tenantId, userId]
    );
    return r.rows;
  }

  async listRolesForPermission(permissionKey: string): Promise<{ id: string; slug: string; name: string }[]> {
    const r = await this.query<{ id: string; slug: string; name: string }>(
      `SELECT DISTINCT r.id, r.slug, r.name
       FROM rbac_roles r
       INNER JOIN rbac_role_permissions rp ON rp.role_id = r.id AND rp.tenant_id = r.tenant_id
       WHERE r.tenant_id = $1 AND rp.permission_key = $2 AND r.is_hidden = FALSE
       ORDER BY LOWER(r.name)`,
      [this.tenantId, permissionKey]
    );
    return r.rows;
  }

  /** All explicit DB permission rows for visible roles (one query). */
  async listAllRolePermissionAssignments(): Promise<
    { role_id: string; slug: string; name: string; permission_key: string }[]
  > {
    const r = await this.query<{ role_id: string; slug: string; name: string; permission_key: string }>(
      `SELECT r.id AS role_id, r.slug, r.name, rp.permission_key
       FROM rbac_roles r
       INNER JOIN rbac_role_permissions rp ON rp.role_id = r.id AND rp.tenant_id = r.tenant_id
       WHERE r.tenant_id = $1 AND r.is_hidden = FALSE
       ORDER BY LOWER(r.name), rp.permission_key`,
      [this.tenantId]
    );
    return r.rows;
  }

  /** Update permission assignments on protected system roles (metadata unchanged). */
  async updateRolePermissionsOnly(
    roleId: string,
    permissionKeys: string[],
    expectedVersion: number
  ): Promise<RbacRoleRow | null> {
    const row = await this.queryOne<RbacRoleRow>(
      `UPDATE rbac_roles
       SET version = version + 1, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND version = $3 AND is_hidden = FALSE
       RETURNING *`,
      [this.tenantId, roleId, expectedVersion]
    );
    if (!row) return null;
    await this.replaceRolePermissions(roleId, permissionKeys);
    return row;
  }

  async createRole(input: {
    slug: string;
    name: string;
    description?: string | null;
    status?: 'active' | 'inactive';
    permissions: string[];
  }): Promise<RbacRoleRow> {
    const id = `rbac_${randomUUID().replace(/-/g, '')}`;
    const row = await this.queryOne<RbacRoleRow>(
      `INSERT INTO rbac_roles (id, tenant_id, slug, name, description, status, is_system, is_protected, is_hidden)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE, FALSE, FALSE)
       RETURNING *`,
      [
        id,
        this.tenantId,
        input.slug,
        input.name,
        input.description ?? null,
        input.status ?? 'active',
      ]
    );
    if (!row) throw new Error('Failed to create role');
    await this.replaceRolePermissions(id, input.permissions);
    return row;
  }

  async updateRole(
    roleId: string,
    input: {
      name: string;
      description?: string | null;
      status: 'active' | 'inactive';
      permissions: string[];
      expectedVersion: number;
    }
  ): Promise<RbacRoleRow | null> {
    const row = await this.queryOne<RbacRoleRow>(
      `UPDATE rbac_roles
       SET name = $3, description = $4, status = $5, version = version + 1, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND version = $6 AND is_protected = FALSE AND is_hidden = FALSE
       RETURNING *`,
      [this.tenantId, roleId, input.name, input.description ?? null, input.status, input.expectedVersion]
    );
    if (!row) return null;
    await this.replaceRolePermissions(roleId, input.permissions);
    return row;
  }

  async duplicateRole(sourceRoleId: string, newSlug: string, newName: string): Promise<RbacRoleRow> {
    const source = await this.getRoleById(sourceRoleId);
    if (!source) throw new Error('Source role not found');
    const permissions = await this.listRolePermissionKeys(sourceRoleId);
    return this.createRole({
      slug: newSlug,
      name: newName,
      description: source.description,
      status: 'active',
      permissions,
    });
  }

  async deleteRole(roleId: string): Promise<boolean> {
    const r = await this.query(
      `DELETE FROM rbac_roles
       WHERE tenant_id = $1 AND id = $2 AND is_protected = FALSE AND is_hidden = FALSE`,
      [this.tenantId, roleId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async replaceRolePermissions(roleId: string, permissionKeys: string[]): Promise<void> {
    await this.query(`DELETE FROM rbac_role_permissions WHERE tenant_id = $1 AND role_id = $2`, [
      this.tenantId,
      roleId,
    ]);
    for (const key of permissionKeys) {
      await this.query(
        `INSERT INTO rbac_role_permissions (tenant_id, role_id, permission_key)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [this.tenantId, roleId, key]
      );
    }
  }

  async assignUserRole(userId: string, roleId: string, assignedBy: string | null): Promise<void> {
    await this.query(
      `INSERT INTO rbac_user_roles (tenant_id, user_id, role_id, assigned_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [this.tenantId, userId, roleId, assignedBy]
    );
  }

  async removeUserRole(userId: string, roleId: string): Promise<boolean> {
    const r = await this.query(
      `DELETE FROM rbac_user_roles WHERE tenant_id = $1 AND user_id = $2 AND role_id = $3`,
      [this.tenantId, userId, roleId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async syncPrimaryUserRole(userId: string, roleSlug: string): Promise<void> {
    const storedRole = storedRoleLabelForEnterpriseSlug(roleSlug);
    await this.query(`UPDATE users SET role = $3, updated_at = NOW() WHERE tenant_id = $1 AND id = $2`, [
      this.tenantId,
      userId,
      storedRole,
    ]);
    await this.query(`UPDATE user_tenants SET role = $3 WHERE tenant_id = $1 AND user_id = $2`, [
      this.tenantId,
      userId,
      storedRole,
    ]);
  }

  async countUsersWithRbacAdminRole(excludeUserId?: string): Promise<number> {
    const params: unknown[] = [this.tenantId];
    let exclude = '';
    if (excludeUserId) {
      params.push(excludeUserId);
      exclude = ` AND ur.user_id <> $${params.length}`;
    }
    const r = await this.query<{ cnt: string }>(
      `SELECT COUNT(DISTINCT ur.user_id)::text AS cnt
       FROM rbac_user_roles ur
       INNER JOIN rbac_roles r ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id
       INNER JOIN rbac_role_permissions rp ON rp.role_id = r.id AND rp.tenant_id = r.tenant_id
       WHERE ur.tenant_id = $1
         AND (
           r.slug IN ('SYSTEM_OWNER', 'super_admin', 'security_administrator')
           OR rp.permission_key IN ('permissions.manage', 'roles.manage')
         )${exclude}`,
      params
    );
    return Number(r.rows[0]?.cnt ?? 0);
  }

  async userHasSystemOwnerRole(userId: string): Promise<boolean> {
    const row = await this.queryOne<{ ok: number }>(
      `SELECT 1 AS ok
       FROM rbac_user_roles ur
       INNER JOIN rbac_roles r ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id
       WHERE ur.tenant_id = $1 AND ur.user_id = $2 AND r.slug = 'SYSTEM_OWNER'
       LIMIT 1`,
      [this.tenantId, userId]
    );
    return row != null;
  }
}
