import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import { GLOBAL_SYSTEM_TENANT_ID } from '../../../constants/globalSystemChart.js';
import {
  ACCOUNT_BALANCE_CASE,
  ACCOUNT_BALANCE_CASE_BY_ID,
} from '../../../financial/accountBalanceSql.js';
import type { AccountRow } from '../../../services/accountsService.js';

const ACCOUNT_SELECT = `a.id, a.tenant_id, a.name, a.type, (${ACCOUNT_BALANCE_CASE})::text AS balance, a.opening_balance, a.description, a.is_permanent, a.parent_account_id, a.user_id, a.version, a.deleted_at, a.created_at, a.updated_at,
  a.bs_position, a.bs_term, a.bs_group_key, a.account_code, a.sub_type, a.is_active`;

const ACCOUNT_SELECT_BY_ID = `a.id, a.tenant_id, a.name, a.type, (${ACCOUNT_BALANCE_CASE_BY_ID})::text AS balance, a.opening_balance, a.description, a.is_permanent, a.parent_account_id, a.user_id, a.version, a.deleted_at, a.created_at, a.updated_at,
  a.bs_position, a.bs_term, a.bs_group_key, a.account_code, a.sub_type, a.is_active`;

const ACCOUNT_CHANGED_SINCE_SELECT = `a.id, a.tenant_id, a.name, a.type, (${ACCOUNT_BALANCE_CASE})::text AS balance, a.opening_balance, a.description, a.is_permanent, a.parent_account_id, a.user_id, a.version, a.deleted_at, a.created_at, a.updated_at,
  a.bs_position, a.bs_term, a.bs_group_key`;

/** Chart-of-accounts reads (tenant + global system rows). */
export class AccountRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<AccountRow | null> {
    const r = await client.query<AccountRow>(
      `SELECT ${ACCOUNT_SELECT_BY_ID}
       FROM accounts a
       WHERE a.id = $1 AND (a.tenant_id = $2 OR a.tenant_id = $3) AND a.deleted_at IS NULL`,
      [id, this.tenantId, GLOBAL_SYSTEM_TENANT_ID]
    );
    return r.rows[0] ?? null;
  }

  async getByIdIncludingDeleted(client: pg.PoolClient, id: string): Promise<AccountRow | null> {
    const r = await client.query<AccountRow>(
      `SELECT ${ACCOUNT_SELECT_BY_ID}
       FROM accounts a
       WHERE a.id = $1 AND (a.tenant_id = $2 OR a.tenant_id = $3)`,
      [id, this.tenantId, GLOBAL_SYSTEM_TENANT_ID]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient): Promise<AccountRow[]> {
    const r = await client.query<AccountRow>(
      `SELECT ${ACCOUNT_SELECT}
       FROM accounts a
       WHERE (a.tenant_id = $1 OR a.tenant_id = $2) AND a.deleted_at IS NULL ORDER BY a.name ASC`,
      [this.tenantId, GLOBAL_SYSTEM_TENANT_ID]
    );
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<AccountRow[]> {
    const r = await client.query<AccountRow>(
      `SELECT ${ACCOUNT_CHANGED_SINCE_SELECT}
       FROM accounts a
       WHERE (a.tenant_id = $1 OR a.tenant_id = $2) AND a.updated_at > $3
       ORDER BY a.updated_at ASC`,
      [this.tenantId, GLOBAL_SYSTEM_TENANT_ID, since]
    );
    return r.rows;
  }
}
