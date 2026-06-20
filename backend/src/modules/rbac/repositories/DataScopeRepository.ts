import { randomUUID } from 'crypto';
import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { ScopeDimension } from '../../../auth/dataScopeTypes.js';

export type UserDataScopeRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  dimension: ScopeDimension;
  entity_id: string | null;
  granted_by: string | null;
  granted_at: Date;
  expires_at: Date | null;
  is_active: boolean;
  reason: string | null;
  updated_at: Date;
};

export type RoleDataScopeRow = {
  id: string;
  tenant_id: string;
  role_id: string;
  dimension: ScopeDimension;
  entity_id: string | null;
  granted_by: string | null;
  granted_at: Date;
  is_active: boolean;
  updated_at: Date;
};

export class DataScopeRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async listActiveUserScopes(userId: string): Promise<UserDataScopeRow[]> {
    const r = await this.query<UserDataScopeRow>(
      `SELECT * FROM rbac_user_data_scopes
       WHERE tenant_id = $1 AND user_id = $2 AND is_active = TRUE
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY dimension, entity_id NULLS FIRST`,
      [this.tenantId, userId]
    );
    return r.rows;
  }

  async listActiveRoleScopes(roleId: string): Promise<RoleDataScopeRow[]> {
    const r = await this.query<RoleDataScopeRow>(
      `SELECT * FROM rbac_role_data_scopes
       WHERE tenant_id = $1 AND role_id = $2 AND is_active = TRUE
       ORDER BY dimension, entity_id NULLS FIRST`,
      [this.tenantId, roleId]
    );
    return r.rows;
  }

  async deactivateUserDimensionScopes(
    client: pg.PoolClient,
    userId: string,
    dimension: ScopeDimension
  ): Promise<void> {
    await client.query(
      `UPDATE rbac_user_data_scopes
       SET is_active = FALSE, updated_at = NOW()
       WHERE tenant_id = $1 AND user_id = $2 AND dimension = $3 AND is_active = TRUE`,
      [this.tenantId, userId, dimension]
    );
  }

  async insertUserScope(
    client: pg.PoolClient,
    input: {
      userId: string;
      dimension: ScopeDimension;
      entityId: string | null;
      grantedBy: string | null;
      reason: string | null;
    }
  ): Promise<UserDataScopeRow> {
    const id = randomUUID();
    const r = await client.query<UserDataScopeRow>(
      `INSERT INTO rbac_user_data_scopes (
         id, tenant_id, user_id, dimension, entity_id, granted_by, reason, is_active, granted_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW(), NOW())
       RETURNING *`,
      [
        id,
        this.tenantId,
        input.userId,
        input.dimension,
        input.entityId,
        input.grantedBy,
        input.reason,
      ]
    );
    return r.rows[0]!;
  }

  async deactivateUserScopeById(client: pg.PoolClient, scopeId: string): Promise<boolean> {
    const r = await client.query(
      `UPDATE rbac_user_data_scopes
       SET is_active = FALSE, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND is_active = TRUE`,
      [this.tenantId, scopeId]
    );
    return (r.rowCount ?? 0) > 0;
  }
}
