/**
 * RBAC 2.0 Phase 4 — resolve effective data scopes for authorization context.
 */
import { createHash } from 'node:crypto';
import type pg from 'pg';
import { getPool } from '../db/pool.js';
import {
  SCOPE_DIMENSIONS,
  type DataScopeGrant,
  type ScopeDimension,
} from './dataScopeTypes.js';
import type { ActiveRoleAssignment } from './rbacPermissionResolver.js';

export type StoredDataScopeRow = {
  source: 'user' | 'role';
  roleId?: string;
  dimension: ScopeDimension;
  entityId: string | null;
};

export type DataScopeMaterial = {
  scopeHash: string;
  scopes: readonly DataScopeGrant[];
};

const ALL_DIMENSIONS: readonly ScopeDimension[] = SCOPE_DIMENSIONS;

function breakGlassAllScopes(): readonly DataScopeGrant[] {
  return ALL_DIMENSIONS.map((dimension) => ({ dimension, mode: 'all' as const }));
}

/** HASH(rbac_user_data_scopes + rbac_role_data_scopes) for access version (Architecture §2.5). */
export function hashStoredDataScopeRows(rows: readonly StoredDataScopeRow[]): string {
  const lines = rows
    .map((r) => `${r.source}:${r.roleId ?? ''}:${r.dimension}:${r.entityId ?? '*'}`)
    .sort();
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

/**
 * Merge user-level and role-level scope rows per dimension (union semantics).
 *
 * Precedence (M5): grants are combined with OR/union logic — least restrictive wins within
 * the user's effective grants for a dimension. If **any** row has `entity_id` NULL (all marker),
 * whether from a user-level or role-level grant, the dimension resolves to `mode: 'all'`.
 * A user-level ALL grant therefore overrides role-level ASSIGNED constraints for that dimension.
 */
function mergeDimensionScopes(
  userRows: readonly StoredDataScopeRow[],
  roleRows: readonly StoredDataScopeRow[]
): readonly DataScopeGrant[] {
  const grants: DataScopeGrant[] = [];
  for (const dimension of ALL_DIMENSIONS) {
    const userDim = userRows.filter((r) => r.dimension === dimension);
    const roleDim = roleRows.filter((r) => r.dimension === dimension);
    const combined = [...userDim, ...roleDim];

    if (combined.length === 0) {
      grants.push({ dimension, mode: 'all' });
      continue;
    }

    if (combined.some((r) => r.entityId === null)) {
      grants.push({ dimension, mode: 'all' });
      continue;
    }

    const entityIds = [...new Set(combined.map((r) => r.entityId).filter(Boolean) as string[])];
    grants.push({ dimension, mode: 'assigned', entityIds });
  }
  return grants;
}

async function loadStoredScopeRows(
  tenantId: string,
  userId: string,
  roleIds: readonly string[],
  client?: pg.PoolClient
): Promise<StoredDataScopeRow[]> {
  const pool = getPool();
  const executor = client ?? (await pool.connect());
  const owns = !client;
  try {
    const userResult = await executor.query<{
      dimension: ScopeDimension;
      entity_id: string | null;
    }>(
      `SELECT dimension, entity_id
       FROM rbac_user_data_scopes
       WHERE tenant_id = $1 AND user_id = $2
         AND is_active = TRUE
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [tenantId, userId]
    );

    const roleRows: StoredDataScopeRow[] = [];
    if (roleIds.length > 0) {
      const roleResult = await executor.query<{
        role_id: string;
        dimension: ScopeDimension;
        entity_id: string | null;
      }>(
        `SELECT role_id, dimension, entity_id
         FROM rbac_role_data_scopes
         WHERE tenant_id = $1 AND role_id = ANY($2::text[])
           AND is_active = TRUE`,
        [tenantId, roleIds]
      );
      for (const row of roleResult.rows) {
        roleRows.push({
          source: 'role',
          roleId: row.role_id,
          dimension: row.dimension,
          entityId: row.entity_id,
        });
      }
    }

    const userRows: StoredDataScopeRow[] = userResult.rows.map((row) => ({
      source: 'user',
      dimension: row.dimension,
      entityId: row.entity_id,
    }));

    return [...userRows, ...roleRows];
  } finally {
    if (owns) executor.release();
  }
}

export { mergeDimensionScopes as mergeEffectiveDataScopeGrants };

export async function resolveDataScopeMaterial(input: {
  tenantId: string;
  userId: string;
  assignments: readonly ActiveRoleAssignment[];
  isBreakGlass?: boolean;
  client?: pg.PoolClient;
}): Promise<DataScopeMaterial> {
  if (input.isBreakGlass) {
    return { scopeHash: hashStoredDataScopeRows([]), scopes: breakGlassAllScopes() };
  }

  const roleIds = input.assignments.map((a) => a.roleId);
  const stored = await loadStoredScopeRows(input.tenantId, input.userId, roleIds, input.client);
  const userRows = stored.filter((r) => r.source === 'user');
  const roleRows = stored.filter((r) => r.source === 'role');

  return {
    scopeHash: hashStoredDataScopeRows(stored),
    scopes: mergeDimensionScopes(userRows, roleRows),
  };
}

export async function resolveEffectiveDataScopes(input: {
  tenantId: string;
  userId: string;
  assignments: readonly ActiveRoleAssignment[];
  isBreakGlass?: boolean;
  client?: pg.PoolClient;
}): Promise<readonly DataScopeGrant[]> {
  const material = await resolveDataScopeMaterial(input);
  return material.scopes;
}

export { ALL_DIMENSIONS as DATA_SCOPE_DIMENSIONS };
