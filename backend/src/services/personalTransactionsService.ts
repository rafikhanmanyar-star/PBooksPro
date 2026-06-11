import type pg from 'pg';
import { randomUUID } from 'crypto';
import { GLOBAL_SYSTEM_TENANT_ID } from '../constants/globalSystemChart.js';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDd } from '../utils/dateOnly.js';
import { recordDomainMutation } from '../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../core/entityMutation.js';
import { PersonalTransactionRepository } from '../modules/personal-finance/repositories/PersonalTransactionRepository.js';

export type PersonalTransactionRow = {
  id: string;
  tenant_id: string;
  account_id: string;
  personal_category_id: string;
  type: string;
  amount: string;
  transaction_date: Date;
  description: string | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function numToApi(n: string | null | undefined): number {
  if (n == null || n === '') return 0;
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

export function rowToPersonalTransactionApi(row: PersonalTransactionRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    accountId: row.account_id,
    personalCategoryId: row.personal_category_id,
    type: row.type,
    amount: numToApi(row.amount),
    transactionDate: formatPgDateToYyyyMmDd(row.transaction_date),
    description: row.description ?? undefined,
    version: row.version,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
  if (row.deleted_at) {
    base.deletedAt =
      row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at;
  }
  return base;
}

function parseClientVersion(body: Record<string, unknown>, fallback?: number): number | undefined {
  if (typeof body.version === 'number') return body.version;
  if (typeof body.version === 'string' && body.version !== '') return parseInt(body.version, 10);
  return fallback;
}

export async function listPersonalTransactionsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<PersonalTransactionRow[]> {
  return new PersonalTransactionRepository(tenantId).listChangedSince(client, since);
}

export async function listPersonalTransactions(
  client: pg.PoolClient,
  tenantId: string
): Promise<PersonalTransactionRow[]> {
  return new PersonalTransactionRepository(tenantId).listActive(client);
}

export async function getPersonalTransactionById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<PersonalTransactionRow | null> {
  return new PersonalTransactionRepository(tenantId).getById(client, id);
}

async function assertAccountExists(
  client: pg.PoolClient,
  tenantId: string,
  accountId: string
): Promise<void> {
  const r = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM accounts WHERE id = $1 AND (tenant_id = $2 OR tenant_id = $3) AND deleted_at IS NULL`,
    [accountId, tenantId, GLOBAL_SYSTEM_TENANT_ID]
  );
  if (Number(r.rows[0]?.c ?? 0) === 0) throw new Error('accountId not found for tenant.');
}

async function assertCategoryExists(
  client: pg.PoolClient,
  tenantId: string,
  categoryId: string
): Promise<void> {
  const r = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM personal_categories WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [categoryId, tenantId]
  );
  if (Number(r.rows[0]?.c ?? 0) === 0) throw new Error('personalCategoryId not found for tenant.');
}

function pickAmount(type: string, raw: unknown): number {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '0'));
  if (!Number.isFinite(n)) return 0;
  if (type === 'Expense') return -Math.abs(n);
  return Math.abs(n);
}

export async function createPersonalTransaction(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  userId?: string | null,
  options?: { skipAudit?: boolean }
): Promise<PersonalTransactionRow> {
  const accountId = String(body.accountId ?? body.account_id ?? '').trim();
  const personalCategoryId = String(
    body.personalCategoryId ?? body.personal_category_id ?? ''
  ).trim();
  const type = String(body.type ?? 'Income').trim();
  if (!accountId) throw new Error('accountId is required.');
  if (!personalCategoryId) throw new Error('personalCategoryId is required.');
  if (type !== 'Income' && type !== 'Expense') throw new Error('type must be Income or Expense.');

  await assertAccountExists(client, tenantId, accountId);
  await assertCategoryExists(client, tenantId, personalCategoryId);

  const amount = pickAmount(type, body.amount);
  const txDateRaw = body.transactionDate ?? body.transaction_date;
  if (txDateRaw == null || String(txDateRaw).trim() === '') throw new Error('transactionDate is required.');
  let transactionDate: string;
  try {
    transactionDate = parseApiDateToYyyyMmDd(txDateRaw);
  } catch {
    throw new Error('Invalid transactionDate.');
  }
  const desc =
    body.description === undefined || body.description === null
      ? null
      : String(body.description);
  const id =
    typeof body.id === 'string' && body.id.trim()
      ? body.id.trim()
      : `ptx_${randomUUID().replace(/-/g, '')}`;

  const row = await new PersonalTransactionRepository(tenantId).insertTransaction(
    client,
    id,
    accountId,
    personalCategoryId,
    type,
    amount,
    transactionDate,
    desc
  );
  if (!options?.skipAudit) {
    await recordDomainMutation(client, {
      tenantId,
      userId: userId ?? null,
      module: 'personal_finance',
      entityType: 'personal_transaction',
      entityId: row.id,
      action: 'create',
      summary: `Personal transaction ${row.id} created`,
      newValue: rowToPersonalTransactionApi(row),
      version: row.version,
    });
  }
  return row;
}

/** All-or-nothing: one DB transaction (caller must use withTransaction). */
export async function bulkCreatePersonalTransactions(
  client: pg.PoolClient,
  tenantId: string,
  items: Record<string, unknown>[],
  userId?: string | null
): Promise<{ imported: number }> {
  for (const body of items) {
    await createPersonalTransaction(client, tenantId, body, userId, { skipAudit: true });
  }
  const imported = items.length;
  if (imported > 0) {
    const { recordBulkPersonalTransactionsChangeLog } = await import('./appStateBulkMutationService.js');
    await recordBulkPersonalTransactionsChangeLog(client, tenantId, imported, userId);
  }
  return { imported };
}

export async function updatePersonalTransaction(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>,
  userId?: string | null
): Promise<PersonalTransactionRow | null> {
  const existing = await getPersonalTransactionById(client, tenantId, id);
  if (!existing) return null;

  const clientVersion = parseClientVersion(body, existing.version);
  if (clientVersion != null) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'personal_transactions',
      entityId: id,
      clientVersion,
    });
    if (lww.conflict) throw new Error('Conflict: transaction was modified by another user.');
  }

  const accountId =
    body.accountId !== undefined || body.account_id !== undefined
      ? String(body.accountId ?? body.account_id).trim()
      : existing.account_id;
  const personalCategoryId =
    body.personalCategoryId !== undefined || body.personal_category_id !== undefined
      ? String(body.personalCategoryId ?? body.personal_category_id).trim()
      : existing.personal_category_id;
  const type = body.type !== undefined ? String(body.type) : existing.type;
  if (type !== 'Income' && type !== 'Expense') throw new Error('type must be Income or Expense.');

  await assertAccountExists(client, tenantId, accountId);
  await assertCategoryExists(client, tenantId, personalCategoryId);

  let amount = numToApi(existing.amount);
  if (body.amount !== undefined) {
    amount = pickAmount(type, body.amount);
  } else if (body.type !== undefined || body.accountId !== undefined) {
    amount = pickAmount(type, Math.abs(amount));
  }

  let dateStr: string;
  if (body.transactionDate != null || body.transaction_date != null) {
    const raw = body.transactionDate ?? body.transaction_date;
    try {
      dateStr = parseApiDateToYyyyMmDd(raw);
    } catch {
      throw new Error('Invalid transactionDate.');
    }
  } else {
    dateStr = formatPgDateToYyyyMmDd(existing.transaction_date);
  }

  const desc =
    body.description === undefined
      ? existing.description
      : body.description === null
        ? null
        : String(body.description);

  const row = await new PersonalTransactionRepository(tenantId).updateActive(
    client,
    id,
    accountId,
    personalCategoryId,
    type,
    amount,
    dateStr,
    desc
  );
  if (row) {
    await recordDomainMutation(client, {
      tenantId,
      userId: userId ?? null,
      module: 'personal_finance',
      entityType: 'personal_transaction',
      entityId: row.id,
      action: 'update',
      summary: `Personal transaction ${row.id} updated`,
      newValue: rowToPersonalTransactionApi(row),
      oldValue: rowToPersonalTransactionApi(existing),
      version: row.version,
    });
  }
  return row;
}

export async function softDeletePersonalTransaction(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  version?: number,
  userId?: string | null
): Promise<PersonalTransactionRow | null> {
  const existing = await new PersonalTransactionRepository(tenantId).getById(client, id);
  if (!existing) return null;

  if (version != null) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'personal_transactions',
      entityId: id,
      clientVersion: version,
    });
    if (lww.conflict) throw new Error('Conflict: transaction was modified by another user.');
  }

  const row = await new PersonalTransactionRepository(tenantId).markDeleted(client, id);
  if (row) {
    await recordDomainMutation(client, {
      tenantId,
      userId: userId ?? null,
      module: 'personal_finance',
      entityType: 'personal_transaction',
      entityId: id,
      action: 'delete',
      summary: `Personal transaction ${id} deleted`,
      oldValue: rowToPersonalTransactionApi(existing),
      version: row.version,
    });
  }
  return row;
}
