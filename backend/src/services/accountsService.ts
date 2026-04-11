import type pg from 'pg';
import { randomUUID } from 'crypto';
import { GLOBAL_SYSTEM_TENANT_ID } from '../constants/globalSystemChart.js';

/** Balance for rows with tenant_id = GLOBAL_SYSTEM_TENANT_ID is derived per requesting tenant from transactions plus opening_balance. */
const ACCOUNT_BALANCE_CASE = `CASE WHEN a.tenant_id = $2 THEN COALESCE((
    SELECT SUM(
      CASE
        WHEN t.type = 'Income' AND t.account_id = a.id THEN t.amount
        WHEN t.type = 'Expense' AND t.account_id = a.id THEN -t.amount
        WHEN t.type = 'Transfer' AND t.from_account_id = a.id THEN -t.amount
        WHEN t.type = 'Transfer' AND t.to_account_id = a.id THEN t.amount
        WHEN t.type = 'Loan' AND t.account_id = a.id THEN
          CASE WHEN t.subtype IN ('Receive Loan', 'Collect Loan') THEN t.amount ELSE -t.amount END
        ELSE 0
      END
    ) FROM transactions t WHERE t.tenant_id = $1 AND t.deleted_at IS NULL
  ), 0) + COALESCE(a.opening_balance, 0) ELSE a.balance END`;

/** Same as ACCOUNT_BALANCE_CASE but $1 = id param, $2 = tenantId, $3 = GLOBAL for get-by-id queries. */
const ACCOUNT_BALANCE_CASE_BY_ID = `CASE WHEN a.tenant_id = $3 THEN COALESCE((
    SELECT SUM(
      CASE
        WHEN t.type = 'Income' AND t.account_id = a.id THEN t.amount
        WHEN t.type = 'Expense' AND t.account_id = a.id THEN -t.amount
        WHEN t.type = 'Transfer' AND t.from_account_id = a.id THEN -t.amount
        WHEN t.type = 'Transfer' AND t.to_account_id = a.id THEN t.amount
        WHEN t.type = 'Loan' AND t.account_id = a.id THEN
          CASE WHEN t.subtype IN ('Receive Loan', 'Collect Loan') THEN t.amount ELSE -t.amount END
        ELSE 0
      END
    ) FROM transactions t WHERE t.tenant_id = $2 AND t.deleted_at IS NULL
  ), 0) + COALESCE(a.opening_balance, 0) ELSE a.balance END`;

export type AccountRow = {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  balance: string;
  description: string | null;
  is_permanent: boolean;
  parent_account_id: string | null;
  user_id: string | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  bs_position?: string | null;
  bs_term?: string | null;
  bs_group_key?: string | null;
  account_code?: string | null;
  sub_type?: string | null;
  is_active?: boolean | null;
  opening_balance?: string | null;
};

export function rowToAccountApi(row: AccountRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    name: row.name,
    type: row.type,
    balance: Number(row.balance),
    isPermanent: row.is_permanent,
    description: row.description ?? undefined,
    parentAccountId: row.parent_account_id ?? undefined,
    userId: row.user_id ?? undefined,
    version: row.version,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    bsPosition: row.bs_position ?? undefined,
    bsTerm: row.bs_term ?? undefined,
    bsGroupKey: row.bs_group_key ?? undefined,
    accountCode: row.account_code ?? undefined,
    accountSubType: row.sub_type ?? undefined,
    isActive: row.is_active === null || row.is_active === undefined ? undefined : Boolean(row.is_active),
    openingBalance: row.opening_balance != null ? Number(row.opening_balance) : 0,
  };
  if (row.deleted_at) {
    base.deletedAt =
      row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at;
  }
  return base;
}

function hasOpeningBalanceKey(body: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(body, 'openingBalance') ||
    Object.prototype.hasOwnProperty.call(body, 'opening_balance')
  );
}

/** Parsed opening balance when the client sent the field; otherwise undefined (caller must preserve DB value on update). */
function openingBalanceFromBody(body: Record<string, unknown>): number | undefined {
  if (!hasOpeningBalanceKey(body)) return undefined;
  const rawOb = body.openingBalance ?? body.opening_balance;
  if (rawOb === undefined || rawOb === null || rawOb === '') return 0;
  const n = Number(rawOb);
  return Number.isFinite(n) ? n : 0;
}

/** On PUT/upsert update, keep DB opening_balance when the client omits the field (avoids wiping with 0). */
function resolveOpeningForUpdate(
  parsedFromBody: number | undefined,
  priorOpening: string | number | null | undefined
): number {
  if (parsedFromBody !== undefined) return parsedFromBody;
  if (priorOpening == null || priorOpening === '') return 0;
  const n = Number(priorOpening);
  return Number.isFinite(n) ? n : 0;
}

function numFromRow(raw: string | number | null | undefined): number {
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Shared chart rows (tenant_id = GLOBAL_SYSTEM_TENANT_ID) cannot rename or retype; opening/balance may be updated.
 * DB may store type as UPPERCASE (seed) while the client sends Title Case enum strings — treat as equivalent.
 */
function assertSystemAccountIdentityUnchanged(
  prior: AccountRow,
  p: ReturnType<typeof pickBody>
): void {
  const nameOk = prior.name.trim().toLowerCase() === p.name.trim().toLowerCase();
  const typeOk =
    String(prior.type ?? '')
      .trim()
      .toLowerCase() ===
    String(p.type ?? '')
      .trim()
      .toLowerCase();
  if (!nameOk || !typeOk) {
    throw new Error('System account name and type cannot be changed.');
  }
}

function pickBody(body: Record<string, unknown>) {
  return {
    name: String(body.name ?? '').trim(),
    type: String(body.type ?? '').trim(),
    balance: body.balance != null ? Number(body.balance) : 0,
    opening_balance: openingBalanceFromBody(body),
    is_permanent:
      body.isPermanent === true ||
      body.isPermanent === 1 ||
      body.is_permanent === true ||
      body.is_permanent === 1,
    description:
      body.description === undefined ? undefined : body.description === null ? null : String(body.description),
    parent_account_id: (body.parentAccountId ?? body.parent_account_id) as string | null | undefined,
    user_id: (body.userId ?? body.user_id) as string | null | undefined,
    version: typeof body.version === 'number' ? body.version : undefined,
  };
}

export async function listAccounts(client: pg.PoolClient, tenantId: string): Promise<AccountRow[]> {
  const r = await client.query<AccountRow>(
    `SELECT a.id, a.tenant_id, a.name, a.type, (${ACCOUNT_BALANCE_CASE})::text AS balance, a.opening_balance, a.description, a.is_permanent, a.parent_account_id, a.user_id, a.version, a.deleted_at, a.created_at, a.updated_at,
            a.bs_position, a.bs_term, a.bs_group_key,
            a.account_code, a.sub_type, a.is_active
     FROM accounts a
     WHERE (a.tenant_id = $1 OR a.tenant_id = $2) AND a.deleted_at IS NULL ORDER BY a.name ASC`,
    [tenantId, GLOBAL_SYSTEM_TENANT_ID]
  );
  return r.rows;
}

export async function getAccountById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<AccountRow | null> {
  const r = await client.query<AccountRow>(
    `SELECT a.id, a.tenant_id, a.name, a.type, (${ACCOUNT_BALANCE_CASE_BY_ID})::text AS balance, a.opening_balance, a.description, a.is_permanent, a.parent_account_id, a.user_id, a.version, a.deleted_at, a.created_at, a.updated_at,
            a.bs_position, a.bs_term, a.bs_group_key,
            a.account_code, a.sub_type, a.is_active
     FROM accounts a
     WHERE a.id = $1 AND (a.tenant_id = $2 OR a.tenant_id = $3) AND a.deleted_at IS NULL`,
    [id, tenantId, GLOBAL_SYSTEM_TENANT_ID]
  );
  return r.rows[0] ?? null;
}

export async function getAccountByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<AccountRow | null> {
  const r = await client.query<AccountRow>(
    `SELECT a.id, a.tenant_id, a.name, a.type, (${ACCOUNT_BALANCE_CASE_BY_ID})::text AS balance, a.opening_balance, a.description, a.is_permanent, a.parent_account_id, a.user_id, a.version, a.deleted_at, a.created_at, a.updated_at,
            a.bs_position, a.bs_term, a.bs_group_key,
            a.account_code, a.sub_type, a.is_active
     FROM accounts a
     WHERE a.id = $1 AND (a.tenant_id = $2 OR a.tenant_id = $3)`,
    [id, tenantId, GLOBAL_SYSTEM_TENANT_ID]
  );
  return r.rows[0] ?? null;
}

export async function createAccount(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null
): Promise<AccountRow> {
  const p = pickBody(body);
  if (!p.name) throw new Error('name is required.');
  if (!p.type) throw new Error('type is required.');
  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `acc_${randomUUID().replace(/-/g, '')}`;

  const r = await client.query<AccountRow>(
    `INSERT INTO accounts (
       id, tenant_id, name, type, balance, opening_balance, description, is_permanent, parent_account_id, user_id, version, deleted_at, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, NULL, NOW(), NOW()
     )
     RETURNING id, tenant_id, name, type, balance, opening_balance, description, is_permanent, parent_account_id, user_id, version, deleted_at, created_at, updated_at`,
    [
      id,
      tenantId,
      p.name,
      p.type,
      Number.isFinite(p.balance) ? p.balance : 0,
      p.opening_balance ?? 0,
      p.description ?? null,
      p.is_permanent,
      p.parent_account_id && String(p.parent_account_id).trim() ? String(p.parent_account_id).trim() : null,
      p.user_id && String(p.user_id).trim() ? String(p.user_id).trim() : actorUserId,
    ]
  );
  return r.rows[0];
}

export async function updateAccount(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>
): Promise<{ row: AccountRow | null; conflict: boolean }> {
  const p = pickBody(body);
  if (!p.name) throw new Error('name is required.');
  if (!p.type) throw new Error('type is required.');
  const expectedVersion = p.version;

  const prior = await getAccountByIdIncludingDeleted(client, tenantId, id);
  if (!prior) {
    return { row: null, conflict: false };
  }

  if (prior.tenant_id === GLOBAL_SYSTEM_TENANT_ID) {
    if (prior.deleted_at) {
      return { row: null, conflict: false };
    }
    assertSystemAccountIdentityUnchanged(prior, p);
    const openingStored = resolveOpeningForUpdate(p.opening_balance, prior.opening_balance);
    const balanceNext = Number.isFinite(p.balance) ? p.balance : numFromRow(prior.balance);

    if (expectedVersion !== undefined) {
      const u = await client.query<AccountRow>(
        `UPDATE accounts SET
           balance = $3, opening_balance = $4, version = version + 1, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $5
         RETURNING id, tenant_id, name, type, balance, opening_balance, description, is_permanent, parent_account_id, user_id, version, deleted_at, created_at, updated_at`,
        [id, GLOBAL_SYSTEM_TENANT_ID, balanceNext, openingStored, expectedVersion]
      );
      if (u.rows.length === 0) {
        const exists = await getAccountById(client, tenantId, id);
        if (!exists) return { row: null, conflict: false };
        return { row: null, conflict: true };
      }
      return { row: (await getAccountById(client, tenantId, id)) ?? u.rows[0], conflict: false };
    }

    const u = await client.query<AccountRow>(
      `UPDATE accounts SET
         balance = $3, opening_balance = $4, version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id, tenant_id, name, type, balance, opening_balance, description, is_permanent, parent_account_id, user_id, version, deleted_at, created_at, updated_at`,
      [id, GLOBAL_SYSTEM_TENANT_ID, balanceNext, openingStored]
    );
    if (!u.rows[0]) return { row: null, conflict: false };
    return { row: (await getAccountById(client, tenantId, id)) ?? u.rows[0], conflict: false };
  }

  const openingStored = resolveOpeningForUpdate(p.opening_balance, prior.opening_balance);

  const vals = [
    p.name,
    p.type,
    Number.isFinite(p.balance) ? p.balance : 0,
    openingStored,
    p.description ?? null,
    p.is_permanent,
    p.parent_account_id && String(p.parent_account_id).trim() ? String(p.parent_account_id).trim() : null,
  ];

  if (expectedVersion !== undefined) {
    const u = await client.query<AccountRow>(
      `UPDATE accounts SET
         name = $3, type = $4, balance = $5, opening_balance = $6, description = $7, is_permanent = $8, parent_account_id = $9,
         version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $10
       RETURNING id, tenant_id, name, type, balance, opening_balance, description, is_permanent, parent_account_id, user_id, version, deleted_at, created_at, updated_at`,
      [id, tenantId, ...vals, expectedVersion]
    );
    if (u.rows.length === 0) {
      const exists = await getAccountById(client, tenantId, id);
      if (!exists) return { row: null, conflict: false };
      return { row: null, conflict: true };
    }
    return { row: (await getAccountById(client, tenantId, id)) ?? u.rows[0], conflict: false };
  }

  const u = await client.query<AccountRow>(
    `UPDATE accounts SET
       name = $3, type = $4, balance = $5, opening_balance = $6, description = $7, is_permanent = $8, parent_account_id = $9,
       version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, tenant_id, name, type, balance, opening_balance, description, is_permanent, parent_account_id, user_id, version, deleted_at, created_at, updated_at`,
    [id, tenantId, ...vals]
  );
  if (!u.rows[0]) return { row: null, conflict: false };
  return { row: (await getAccountById(client, tenantId, id)) ?? u.rows[0], conflict: false };
}

export async function upsertAccount(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null
): Promise<{ row: AccountRow; conflict: boolean; wasInsert: boolean }> {
  const p = pickBody(body);
  if (!p.name) throw new Error('name is required.');
  if (!p.type) throw new Error('type is required.');

  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `acc_${randomUUID().replace(/-/g, '')}`;

  const existing = await getAccountByIdIncludingDeleted(client, tenantId, id);
  if (!existing) {
    const row = await createAccount(client, tenantId, { ...body, id }, actorUserId);
    return { row, conflict: false, wasInsert: true };
  }
  if (existing.tenant_id === GLOBAL_SYSTEM_TENANT_ID) {
    assertSystemAccountIdentityUnchanged(existing, p);
    const expectedVersionGlobal = p.version;
    if (expectedVersionGlobal !== undefined && existing.version !== expectedVersionGlobal) {
      const row = await getAccountById(client, tenantId, id);
      if (!row) throw new Error('System account not found.');
      return { row, conflict: true, wasInsert: false };
    }
    const openingStored = resolveOpeningForUpdate(p.opening_balance, existing.opening_balance);
    const balanceNext = Number.isFinite(p.balance) ? p.balance : numFromRow(existing.balance);
    const u = await client.query<AccountRow>(
      `UPDATE accounts SET
         balance = $3, opening_balance = $4, version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id, tenant_id, name, type, balance, opening_balance, description, is_permanent, parent_account_id, user_id, version, deleted_at, created_at, updated_at`,
      [id, GLOBAL_SYSTEM_TENANT_ID, balanceNext, openingStored]
    );
    const row = u.rows[0];
    if (!row) throw new Error('System account upsert failed.');
    const withBalance = await getAccountById(client, tenantId, id);
    return { row: withBalance ?? row, conflict: false, wasInsert: false };
  }

  const expectedVersion = p.version;
  if (expectedVersion !== undefined && existing.version !== expectedVersion) {
    return { row: existing, conflict: true, wasInsert: false };
  }

  const openingStored = resolveOpeningForUpdate(p.opening_balance, existing.opening_balance);

  const vals = [
    p.name,
    p.type,
    Number.isFinite(p.balance) ? p.balance : 0,
    openingStored,
    p.description ?? null,
    p.is_permanent,
    p.parent_account_id && String(p.parent_account_id).trim() ? String(p.parent_account_id).trim() : null,
    p.user_id && String(p.user_id).trim() ? String(p.user_id).trim() : null,
  ];

  const u = await client.query<AccountRow>(
    `UPDATE accounts SET
       name = $3, type = $4, balance = $5, opening_balance = $6, description = $7, is_permanent = $8, parent_account_id = $9,
       user_id = COALESCE($10, user_id),
       deleted_at = NULL, version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, tenant_id, name, type, balance, opening_balance, description, is_permanent, parent_account_id, user_id, version, deleted_at, created_at, updated_at`,
    [id, tenantId, ...vals]
  );
  const row = u.rows[0];
  if (!row) throw new Error('Account upsert failed.');
  const withBalance = await getAccountById(client, tenantId, id);
  return { row: withBalance ?? row, conflict: false, wasInsert: false };
}

export async function softDeleteAccount(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean }> {
  const ex = await getAccountByIdIncludingDeleted(client, tenantId, id);
  if (ex?.tenant_id === GLOBAL_SYSTEM_TENANT_ID) return { ok: false, conflict: false };

  if (expectedVersion !== undefined) {
    const r = await client.query(
      `UPDATE accounts SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $3`,
      [id, tenantId, expectedVersion]
    );
    if (r.rowCount === 0) {
      const ex = await getAccountById(client, tenantId, id);
      if (!ex) return { ok: false, conflict: false };
      return { ok: false, conflict: true };
    }
    return { ok: true, conflict: false };
  }
  const r = await client.query(
    `UPDATE accounts SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return { ok: (r.rowCount ?? 0) > 0, conflict: false };
}

export async function listAccountsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<AccountRow[]> {
  const r = await client.query<AccountRow>(
    `SELECT a.id, a.tenant_id, a.name, a.type, (${ACCOUNT_BALANCE_CASE})::text AS balance, a.opening_balance, a.description, a.is_permanent, a.parent_account_id, a.user_id, a.version, a.deleted_at, a.created_at, a.updated_at,
            a.bs_position, a.bs_term, a.bs_group_key
     FROM accounts a
     WHERE (a.tenant_id = $1 OR a.tenant_id = $2) AND a.updated_at > $3
     ORDER BY a.updated_at ASC`,
    [tenantId, GLOBAL_SYSTEM_TENANT_ID, since]
  );
  return r.rows;
}
