import type pg from 'pg';
import { randomUUID } from 'crypto';
import { GLOBAL_SYSTEM_TENANT_ID } from '../../../constants/globalSystemChart.js';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../../../core/entityMutation.js';
import {
  AccountRepository,
  type AccountWriteFields,
} from '../repositories/AccountRepository.js';

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

/** Map DB enum (`BANK`) to API enum (`Bank`) used by report engines. */
export function normalizeAccountType(raw: string): string {
  const key = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    bank: 'Bank',
    cash: 'Cash',
    asset: 'Asset',
    liability: 'Liability',
    equity: 'Equity',
  };
  return map[key] ?? raw;
}

export function rowToAccountApi(row: AccountRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    name: row.name,
    type: normalizeAccountType(row.type),
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

function lwwTenantForAccountRow(row: AccountRow, requestTenantId: string): string {
  return row.tenant_id === GLOBAL_SYSTEM_TENANT_ID ? GLOBAL_SYSTEM_TENANT_ID : requestTenantId;
}

async function auditAccountMutation(
  client: pg.PoolClient,
  tenantId: string,
  accountId: string,
  action: 'create' | 'update' | 'delete',
  opts?: { userId?: string | null; summary?: string; oldValue?: Record<string, unknown> }
): Promise<void> {
  if (action === 'delete') {
    await recordDomainMutation(client, {
      tenantId,
      userId: opts?.userId ?? null,
      module: 'accounts',
      entityType: 'account',
      entityId: accountId,
      action,
      summary: opts?.summary ?? `Account ${accountId} deleted`,
      oldValue: opts?.oldValue,
    });
    return;
  }
  const row = await getAccountById(client, tenantId, accountId);
  if (!row) return;
  await recordDomainMutation(client, {
    tenantId,
    userId: opts?.userId ?? row.user_id,
    module: 'accounts',
    entityType: 'account',
    entityId: accountId,
    action,
    summary: opts?.summary ?? `Account ${row.name} ${action}`,
    newValue: rowToAccountApi(row),
    oldValue: opts?.oldValue,
    version: row.version,
  });
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

function toAccountWriteFields(
  p: ReturnType<typeof pickBody>,
  openingStored: number
): AccountWriteFields {
  return {
    name: p.name,
    type: p.type,
    balance: Number.isFinite(p.balance) ? p.balance : 0,
    opening_balance: openingStored,
    description: p.description ?? null,
    is_permanent: p.is_permanent,
    parent_account_id:
      p.parent_account_id && String(p.parent_account_id).trim() ? String(p.parent_account_id).trim() : null,
  };
}

export async function listAccounts(client: pg.PoolClient, tenantId: string): Promise<AccountRow[]> {
  return new AccountRepository(tenantId).listActive(client);
}

export async function getAccountById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<AccountRow | null> {
  return new AccountRepository(tenantId).getById(client, id);
}

export async function getAccountByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<AccountRow | null> {
  return new AccountRepository(tenantId).getByIdIncludingDeleted(client, id);
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

  const repo = new AccountRepository(tenantId);
  const row = await repo.insertAccount(
    client,
    id,
    toAccountWriteFields(p, p.opening_balance ?? 0),
    p.user_id && String(p.user_id).trim() ? String(p.user_id).trim() : actorUserId
  );
  await auditAccountMutation(client, tenantId, row.id, 'create', {
    userId: actorUserId,
  });
  return row;
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
  const oldApi = rowToAccountApi(prior);

  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId: lwwTenantForAccountRow(prior, tenantId),
      table: 'accounts',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { row: null, conflict: true };
  }

  const repo = new AccountRepository(tenantId);

  if (prior.tenant_id === GLOBAL_SYSTEM_TENANT_ID) {
    if (prior.deleted_at) {
      return { row: null, conflict: false };
    }
    assertSystemAccountIdentityUnchanged(prior, p);
    const openingStored = resolveOpeningForUpdate(p.opening_balance, prior.opening_balance);
    const balanceNext = Number.isFinite(p.balance) ? p.balance : numFromRow(prior.balance);

    const u = await repo.updateSystemBalance(
      client,
      id,
      balanceNext,
      openingStored,
      expectedVersion
    );
    if (!u) {
      if (expectedVersion !== undefined) {
        const exists = await getAccountById(client, tenantId, id);
        if (!exists) return { row: null, conflict: false };
        return { row: null, conflict: true };
      }
      return { row: null, conflict: false };
    }
    const row = (await getAccountById(client, tenantId, id)) ?? u;
    await auditAccountMutation(client, tenantId, id, 'update', { oldValue: oldApi });
    return { row, conflict: false };
  }

  const openingStored = resolveOpeningForUpdate(p.opening_balance, prior.opening_balance);
  const fields = toAccountWriteFields(p, openingStored);

  const u = await repo.updateTenantActive(client, id, fields, expectedVersion);
  if (!u) {
    if (expectedVersion !== undefined) {
      const exists = await getAccountById(client, tenantId, id);
      if (!exists) return { row: null, conflict: false };
      return { row: null, conflict: true };
    }
    return { row: null, conflict: false };
  }
  const row = (await getAccountById(client, tenantId, id)) ?? u;
  await auditAccountMutation(client, tenantId, id, 'update', { oldValue: oldApi });
  return { row, conflict: false };
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
    if (expectedVersionGlobal !== undefined) {
      const lww = await checkEntityLwwConflict(client, {
        tenantId: GLOBAL_SYSTEM_TENANT_ID,
        table: 'accounts',
        entityId: id,
        clientVersion: expectedVersionGlobal,
      });
      if (lww.conflict) {
        const row = await getAccountById(client, tenantId, id);
        if (!row) throw new Error('System account not found.');
        return { row, conflict: true, wasInsert: false };
      }
    }
    const oldApi = rowToAccountApi(existing);
    const openingStored = resolveOpeningForUpdate(p.opening_balance, existing.opening_balance);
    const balanceNext = Number.isFinite(p.balance) ? p.balance : numFromRow(existing.balance);
    const repo = new AccountRepository(tenantId);
    const row = await repo.updateSystemBalance(client, id, balanceNext, openingStored);
    if (!row) throw new Error('System account upsert failed.');
    const withBalance = await getAccountById(client, tenantId, id);
    const out = withBalance ?? row;
    await auditAccountMutation(client, tenantId, id, 'update', { oldValue: oldApi, userId: actorUserId });
    return { row: out, conflict: false, wasInsert: false };
  }

  const expectedVersion = p.version;
  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'accounts',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { row: existing, conflict: true, wasInsert: false };
  }

  const openingStored = resolveOpeningForUpdate(p.opening_balance, existing.opening_balance);
  const oldApi = rowToAccountApi(existing);
  const repo = new AccountRepository(tenantId);

  const row = await repo.updateUpsertRestore(
    client,
    id,
    toAccountWriteFields(p, openingStored),
    p.user_id && String(p.user_id).trim() ? String(p.user_id).trim() : null
  );
  if (!row) throw new Error('Account upsert failed.');
  const withBalance = await getAccountById(client, tenantId, id);
  const out = withBalance ?? row;
  await auditAccountMutation(client, tenantId, id, 'update', { oldValue: oldApi, userId: actorUserId });
  return { row: out, conflict: false, wasInsert: false };
}

export async function softDeleteAccount(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean }> {
  const ex = await getAccountByIdIncludingDeleted(client, tenantId, id);
  if (ex?.tenant_id === GLOBAL_SYSTEM_TENANT_ID) return { ok: false, conflict: false };
  const oldApi = ex ? rowToAccountApi(ex) : undefined;

  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'accounts',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { ok: false, conflict: true };

    const repo = new AccountRepository(tenantId);
    const ok = await repo.markDeleted(client, id, expectedVersion);
    if (!ok) {
      const ex = await getAccountById(client, tenantId, id);
      if (!ex) return { ok: false, conflict: false };
      return { ok: false, conflict: true };
    }
    await auditAccountMutation(client, tenantId, id, 'delete', { oldValue: oldApi });
    return { ok: true, conflict: false };
  }
  const repo = new AccountRepository(tenantId);
  const ok = await repo.markDeleted(client, id);
  if (ok) {
    await auditAccountMutation(client, tenantId, id, 'delete', { oldValue: oldApi });
  }
  return { ok, conflict: false };
}

export async function listAccountsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<AccountRow[]> {
  return new AccountRepository(tenantId).listChangedSince(client, since);
}
