import type pg from 'pg';
import { resolveEnterpriseRole } from '../../../auth/permissions.js';
import { RbacRepository } from '../repositories/RbacRepository.js';

/** Replace RBAC assignments for a user based on legacy role label (e.g. "Sales User"). */
export async function syncUserRbacFromLegacyRole(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  legacyRole: string,
  assignedBy: string | null
): Promise<void> {
  const slug = resolveEnterpriseRole(legacyRole);
  const repo = new RbacRepository(tenantId, client);
  const rbacRole = await repo.getRoleBySlug(slug, true);
  if (!rbacRole) return;
  await client.query(`DELETE FROM rbac_user_roles WHERE tenant_id = $1 AND user_id = $2`, [tenantId, userId]);
  await repo.assignUserRole(userId, rbacRole.id, assignedBy);
  await repo.syncPrimaryUserRole(userId, rbacRole.slug);
}
