import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import { GLOBAL_SYSTEM_TENANT_ID } from '../../../constants/globalSystemChart.js';
import {
  ACCOUNT_BALANCE_CASE,
  ACCOUNT_BALANCE_CASE_BY_ID,
} from '../../../financial/accountBalanceSql.js';
import type { AccountRow } from '../services/accountsService.js';

const ACCOUNT_SELECT = `a.id, a.tenant_id, a.name, a.type, (${ACCOUNT_BALANCE_CASE})::text AS balance, a.opening_balance, a.description, a.is_permanent, a.parent_account_id, a.user_id, a.version, a.deleted_at, a.created_at, a.updated_at,
  a.bs_position, a.bs_term, a.bs_group_key, a.account_code, a.sub_type, a.is_active`;

const ACCOUNT_SELECT_BY_ID = `a.id, a.tenant_id, a.name, a.type, (${ACCOUNT_BALANCE_CASE_BY_ID})::text AS balance, a.opening_balance, a.description, a.is_permanent, a.parent_account_id, a.user_id, a.version, a.deleted_at, a.created_at, a.updated_at,
  a.bs_position, a.bs_term, a.bs_group_key, a.account_code, a.sub_type, a.is_active`;

const ACCOUNT_CHANGED_SINCE_SELECT = `a.id, a.tenant_id, a.name, a.type, (${ACCOUNT_BALANCE_CASE})::text AS balance, a.opening_balance, a.description, a.is_permanent, a.parent_account_id, a.user_id, a.version, a.deleted_at, a.created_at, a.updated_at,
  a.bs_position, a.bs_term, a.bs_group_key`;

const ACCOUNT_WRITE_RETURN = `id, tenant_id, name, type, balance, opening_balance, description, is_permanent, parent_account_id, user_id, version, deleted_at, created_at, updated_at`;

export type AccountWriteFields = {
  name: string;
  type: string;
  balance: number;
  opening_balance: number;
  description: string | null;
  is_permanent: boolean;
  parent_account_id: string | null;
};

function accountFieldParams(fields: AccountWriteFields): unknown[] {
  return [
    fields.name,
    fields.type,
    fields.balance,
    fields.opening_balance,
    fields.description,
    fields.is_permanent,
    fields.parent_account_id,
  ];
}

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

  async insertAccount(
    client: pg.PoolClient,
    id: string,
    fields: AccountWriteFields,
    userId: string | null
  ): Promise<AccountRow> {
    const r = await client.query<AccountRow>(
      `INSERT INTO accounts (
         id, tenant_id, name, type, balance, opening_balance, description, is_permanent, parent_account_id, user_id, version, deleted_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, NULL, NOW(), NOW()
       )
       RETURNING ${ACCOUNT_WRITE_RETURN}`,
      [id, this.tenantId, ...accountFieldParams(fields), userId]
    );
    return r.rows[0]!;
  }

  async updateTenantActive(
    client: pg.PoolClient,
    id: string,
    fields: AccountWriteFields,
    expectedVersion?: number
  ): Promise<AccountRow | null> {
    const versionClause = expectedVersion !== undefined ? ' AND version = $10' : '';
    const params =
      expectedVersion !== undefined
        ? [id, this.tenantId, ...accountFieldParams(fields), expectedVersion]
        : [id, this.tenantId, ...accountFieldParams(fields)];
    const r = await client.query<AccountRow>(
      `UPDATE accounts SET
         name = $3, type = $4, balance = $5, opening_balance = $6, description = $7, is_permanent = $8, parent_account_id = $9,
         version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL${versionClause}
       RETURNING ${ACCOUNT_WRITE_RETURN}`,
      params
    );
    return r.rows[0] ?? null;
  }

  async updateSystemBalance(
    client: pg.PoolClient,
    id: string,
    balance: number,
    openingBalance: number,
    expectedVersion?: number
  ): Promise<AccountRow | null> {
    const versionClause = expectedVersion !== undefined ? ' AND version = $5' : '';
    const params =
      expectedVersion !== undefined
        ? [id, GLOBAL_SYSTEM_TENANT_ID, balance, openingBalance, expectedVersion]
        : [id, GLOBAL_SYSTEM_TENANT_ID, balance, openingBalance];
    const r = await client.query<AccountRow>(
      `UPDATE accounts SET
         balance = $3, opening_balance = $4, version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL${versionClause}
       RETURNING ${ACCOUNT_WRITE_RETURN}`,
      params
    );
    return r.rows[0] ?? null;
  }

  async updateUpsertRestore(
    client: pg.PoolClient,
    id: string,
    fields: AccountWriteFields,
    userId: string | null
  ): Promise<AccountRow | null> {
    const r = await client.query<AccountRow>(
      `UPDATE accounts SET
         name = $3, type = $4, balance = $5, opening_balance = $6, description = $7, is_permanent = $8, parent_account_id = $9,
         user_id = COALESCE($10, user_id),
         deleted_at = NULL, version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING ${ACCOUNT_WRITE_RETURN}`,
      [id, this.tenantId, ...accountFieldParams(fields), userId]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(client: pg.PoolClient, id: string, expectedVersion?: number): Promise<boolean> {
    const versionClause = expectedVersion !== undefined ? ' AND version = $3' : '';
    const params =
      expectedVersion !== undefined ? [id, this.tenantId, expectedVersion] : [id, this.tenantId];
    const r = await client.query(
      `UPDATE accounts SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL${versionClause}`,
      params
    );
    return (r.rowCount ?? 0) > 0;
  }

  async listOpeningBalanceInputs(client: pg.PoolClient): Promise<
    Array<{
      account_id: string;
      account_name: string;
      account_type: string;
      parent_account_id: string | null;
      account_code: string | null;
      sub_type: string | null;
      is_active: boolean;
      opening_balance: number;
    }>
  > {
    const r = await client.query(
      `SELECT
        a.id AS account_id,
        a.name AS account_name,
        a.type AS account_type,
        a.parent_account_id AS parent_account_id,
        a.account_code AS account_code,
        a.sub_type AS sub_type,
        COALESCE(a.is_active, TRUE) AS is_active,
        COALESCE(a.opening_balance, 0)::float AS opening_balance
      FROM accounts a
      WHERE (a.tenant_id = $1 OR a.tenant_id = $2)
        AND a.deleted_at IS NULL
        AND COALESCE(a.opening_balance, 0) <> 0`,
      [this.tenantId, GLOBAL_SYSTEM_TENANT_ID]
    );
    return r.rows as Array<{
      account_id: string;
      account_name: string;
      account_type: string;
      parent_account_id: string | null;
      account_code: string | null;
      sub_type: string | null;
      is_active: boolean;
      opening_balance: number;
    }>;
  }
}
