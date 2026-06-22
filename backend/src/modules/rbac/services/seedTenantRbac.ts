/**
 * RBAC-first tenant provisioning — seeds system roles, permissions, and creator assignment.
 * Idempotent: safe to call on existing tenants (skips existing roles; seeds permissions only when empty).
 */
import type pg from 'pg';
import {
  getSystemRoleSeedPermissionKeys,
  getRoleTemplateById,
  SOD_HELPER_ROLE_TEMPLATES,
  SYSTEM_ROLE_DEFINITIONS,
  type SystemRoleSlug,
} from '../../../auth/roleTemplates.js';
import { findSodViolation } from './rbacSodService.js';
import { RbacRepository } from '../repositories/RbacRepository.js';
import { computeRoleVersionHash } from './rbacRoleVersionService.js';
import { seedTenantApprovalMatrix } from './approvalMatrixSeed.js';

export type SeedTenantRbacOptions = {
  /** Assign this user to company_admin after seeding. */
  creatorUserId?: string;
  /** Role slug for creator (default company_admin). */
  creatorRoleSlug?: SystemRoleSlug;
  assignedBy?: string | null;
  /** Seed default approval matrix (RBAC V2). Default true. */
  seedApprovalMatrix?: boolean;
  /** Instantiate SoD-safe helper roles (payroll_officer, etc.). Default true. */
  seedSodHelperRoles?: boolean;
};

export type SeedTenantRbacResult = {
  tenantId: string;
  rolesCreated: number;
  rolesExisting: number;
  permissionsSeeded: number;
  helperRolesCreated: number;
  creatorAssigned: boolean;
  creatorRoleSlug: string | null;
  sodViolationsInSeed: string[];
  roleSlugs: string[];
};

function stableSystemRoleId(tenantId: string, slug: string): string {
  if (slug === 'SYSTEM_OWNER') return `rbac_${tenantId}_system_owner`;
  if (slug === 'security_administrator') return `rbac_${tenantId}_security_administrator`;
  return `rbac_${tenantId}_${slug}`;
}

function assertSeedPermissionsSodSafe(slug: string, keys: readonly string[]): void {
  const violation = findSodViolation(new Set(keys), `seed:role:${slug}`);
  if (violation) {
    throw new Error(
      `seedTenantRbac: SoD violation in seed data for role "${slug}": ` +
        `${violation.permissionA} + ${violation.permissionB}`
    );
  }
}

async function ensureSystemRole(
  client: pg.PoolClient,
  tenantId: string,
  def: (typeof SYSTEM_ROLE_DEFINITIONS)[number]
): Promise<{ id: string; created: boolean; permissionSeeded: number }> {
  const id = stableSystemRoleId(tenantId, def.slug);
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM rbac_roles WHERE tenant_id = $1 AND slug = $2`,
    [tenantId, def.slug]
  );

  let created = false;
  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO rbac_roles (
         id, tenant_id, slug, name, description, status, is_system, is_protected, is_hidden, role_type
       )
       VALUES ($1, $2, $3, $4, $5, 'active', TRUE, TRUE, $6, 'system')`,
      [id, tenantId, def.slug, def.name, def.description, def.isHidden]
    );
    created = true;
  }

  const roleId = existing.rows[0]?.id ?? id;
  const permCountRow = await client.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM rbac_role_permissions WHERE tenant_id = $1 AND role_id = $2`,
    [tenantId, roleId]
  );
  const existingPermCount = Number(permCountRow.rows[0]?.cnt ?? 0);

  let permissionSeeded = 0;
  if (!def.usesFullCatalog && existingPermCount === 0) {
    const keys = getSystemRoleSeedPermissionKeys(def.slug);
    assertSeedPermissionsSodSafe(def.slug, keys);
    const repo = new RbacRepository(tenantId, client);
    await repo.replaceRolePermissions(roleId, [...keys]);
    permissionSeeded = keys.length;

    const versionRow = await client.query<{ version: number }>(
      `SELECT version FROM rbac_roles WHERE tenant_id = $1 AND id = $2`,
      [tenantId, roleId]
    );
    const version = versionRow.rows[0]?.version ?? 1;
    const hash = computeRoleVersionHash({
      tenantId,
      roleId,
      version,
      permissionKeys: keys,
    });
    await repo.setRoleVersionHash(roleId, hash);
  }

  return { id: roleId, created, permissionSeeded };
}

async function seedSodHelperRole(
  client: pg.PoolClient,
  tenantId: string,
  templateSlug: string
): Promise<boolean> {
  const template = getRoleTemplateById(templateSlug);
  if (!template) return false;

  const existing = await client.query(
    `SELECT id FROM rbac_roles WHERE tenant_id = $1 AND slug = $2`,
    [tenantId, template.slug]
  );
  if (existing.rows.length > 0) return false;

  assertSeedPermissionsSodSafe(template.slug, template.permissionKeys);
  const repo = new RbacRepository(tenantId, client);
  await repo.createRole({
    slug: template.slug,
    name: template.name,
    description: template.description,
    permissions: [...template.permissionKeys],
    roleType: 'template_instance',
    templateId: template.id,
  });
  return true;
}

async function assignCreatorRole(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  roleSlug: SystemRoleSlug,
  assignedBy: string | null
): Promise<boolean> {
  const repo = new RbacRepository(tenantId, client);
  const role = await repo.getRoleBySlug(roleSlug, true);
  if (!role) {
    throw new Error(`seedTenantRbac: role "${roleSlug}" not found for tenant ${tenantId}`);
  }

  const existing = await repo.listUserRoleAssignments(userId);
  const alreadyAssigned = existing.some((a) => a.role_id === role.id);
  if (!alreadyAssigned) {
    await repo.assignUserRole(userId, role.id, assignedBy);
  }

  await repo.syncPrimaryUserRole(userId, role.slug);

  await client.query(
    `UPDATE users SET access_version = access_version + 1, updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, userId]
  );
  await client.query(
    `UPDATE tenants SET rbac_global_version = rbac_global_version + 1, updated_at = NOW()
     WHERE id = $1`,
    [tenantId]
  );

  return !alreadyAssigned;
}

/**
 * Seed RBAC V2 infrastructure for a new tenant.
 * Call inside the same transaction as tenant + admin user creation.
 */
export async function seedTenantRbac(
  client: pg.PoolClient,
  tenantId: string,
  options: SeedTenantRbacOptions = {}
): Promise<SeedTenantRbacResult> {
  const creatorRoleSlug = options.creatorRoleSlug ?? 'company_admin';
  const seedApprovalMatrix = options.seedApprovalMatrix !== false;
  const seedSodHelpers = options.seedSodHelperRoles !== false;

  let rolesCreated = 0;
  let rolesExisting = 0;
  let permissionsSeeded = 0;
  const roleSlugs: string[] = [];

  for (const def of SYSTEM_ROLE_DEFINITIONS) {
    const result = await ensureSystemRole(client, tenantId, def);
    roleSlugs.push(def.slug);
    if (result.created) rolesCreated++;
    else rolesExisting++;
    permissionsSeeded += result.permissionSeeded;
  }

  let helperRolesCreated = 0;
  if (seedSodHelpers) {
    for (const templateSlug of SOD_HELPER_ROLE_TEMPLATES) {
      const created = await seedSodHelperRole(client, tenantId, templateSlug);
      if (created) {
        helperRolesCreated++;
        roleSlugs.push(templateSlug);
      }
    }
  }

  if (seedApprovalMatrix) {
    await seedTenantApprovalMatrix(client, tenantId);
  }

  let creatorAssigned = false;
  if (options.creatorUserId) {
    creatorAssigned = await assignCreatorRole(
      client,
      tenantId,
      options.creatorUserId,
      creatorRoleSlug,
      options.assignedBy ?? null
    );
  }

  return {
    tenantId,
    rolesCreated,
    rolesExisting,
    permissionsSeeded,
    helperRolesCreated,
    creatorAssigned,
    creatorRoleSlug: options.creatorUserId ? creatorRoleSlug : null,
    sodViolationsInSeed: [],
    roleSlugs,
  };
}
