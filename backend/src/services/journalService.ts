import type pg from 'pg';
import { randomUUID } from 'crypto';
import { GLOBAL_SYSTEM_TENANT_ID } from '../constants/globalSystemChart.js';
import { todayUtcYyyyMmDd } from '../utils/dateOnly.js';
import {
  roundMoney,
  validateBalanced,
  swapLinesForReversal,
  type JournalLineInput,
} from '../financial/validation.js';

export type CreateJournalBody = {
  entryDate: string;
  reference?: string;
  description?: string | null;
  sourceModule?: string | null;
  sourceId?: string | null;
  createdBy?: string | null;
  lines: JournalLineInput[];
};

function newId(): string {
  return randomUUID();
}

async function assertAccountsExist(
  client: pg.PoolClient,
  tenantId: string,
  accountIds: string[]
): Promise<void> {
  const uniq = [...new Set(accountIds)];
  if (uniq.length === 0) throw new Error('No accounts specified.');
  const ph = uniq.map((_, i) => `$${i + 1}`).join(',');
  const r = await client.query<{ id: string }>(
    `SELECT id FROM accounts WHERE id IN (${ph}) AND deleted_at IS NULL
     AND (tenant_id = $${uniq.length + 1} OR tenant_id = $${uniq.length + 2})`,
    [...uniq, tenantId, GLOBAL_SYSTEM_TENANT_ID]
  );
  const found = new Set(r.rows.map((x: { id: string }) => x.id));
  for (const id of uniq) {
    if (!found.has(id)) {
      throw new Error(`Account not found for this tenant or inactive: ${id}`);
    }
  }
}

export async function insertJournalEntry(
  client: pg.PoolClient,
  tenantId: string,
  input: CreateJournalBody,
  journalEntryIdOverride?: string
): Promise<{ journalEntryId: string }> {
  const err = validateBalanced(input.lines);
  if (err) throw new Error(err);

  await assertAccountsExist(
    client,
    tenantId,
    input.lines.map((l) => l.accountId)
  );

  const journalEntryId = journalEntryIdOverride ?? newId();

  await client.query(
    `INSERT INTO journal_entries (id, tenant_id, entry_date, reference, description, source_module, source_id, created_by, created_at)
     VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, NOW())`,
    [
      journalEntryId,
      tenantId,
      input.entryDate,
      input.reference ?? '',
      input.description ?? null,
      input.sourceModule ?? null,
      input.sourceId ?? null,
      input.createdBy ?? null,
    ]
  );

  for (let idx = 0; idx < input.lines.length; idx++) {
    const line = input.lines[idx];
    const lineId = newId();
    const d = roundMoney(line.debitAmount);
    const c = roundMoney(line.creditAmount);
    await client.query(
      `INSERT INTO journal_lines (id, journal_entry_id, account_id, debit_amount, credit_amount, line_number)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [lineId, journalEntryId, line.accountId, d, c, idx]
    );
  }

  const auditId = newId();
  const auditPayload = JSON.stringify({
    journalEntryId,
    entryDate: input.entryDate,
    reference: input.reference,
    sourceModule: input.sourceModule,
    sourceId: input.sourceId,
    lines: input.lines.map((l) => ({
      accountId: l.accountId,
      debitAmount: roundMoney(l.debitAmount),
      creditAmount: roundMoney(l.creditAmount),
    })),
  });
  await client.query(
    `INSERT INTO accounting_audit_log (id, tenant_id, entity_type, entity_id, action, user_id, timestamp, old_value, new_value)
     VALUES ($1, $2, 'journal_entry', $3, 'create', $4, NOW(), NULL, $5)`,
    [auditId, tenantId, journalEntryId, input.createdBy ?? null, auditPayload]
  );

  return { journalEntryId };
}

export async function createJournalEntry(
  client: pg.PoolClient,
  tenantId: string,
  input: CreateJournalBody
): Promise<{ journalEntryId: string }> {
  return insertJournalEntry(client, tenantId, input);
}

export async function getJournalWithLines(
  client: pg.PoolClient,
  journalEntryId: string,
  tenantId: string
): Promise<{
  entry: Record<string, unknown>;
  lines: Record<string, unknown>[];
} | null> {
  const e = await client.query(
    `SELECT id, tenant_id, entry_date, reference, description, source_module, source_id, created_by, created_at
     FROM journal_entries WHERE id = $1 AND tenant_id = $2`,
    [journalEntryId, tenantId]
  );
  if (e.rows.length === 0) return null;
  const l = await client.query(
    `SELECT id, journal_entry_id, account_id, debit_amount, credit_amount, line_number
     FROM journal_lines WHERE journal_entry_id = $1 ORDER BY line_number ASC`,
    [journalEntryId]
  );
  return { entry: e.rows[0], lines: l.rows };
}

export async function isJournalReversed(
  client: pg.PoolClient,
  originalJournalEntryId: string
): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM journal_reversals WHERE original_journal_entry_id = $1 LIMIT 1`,
    [originalJournalEntryId]
  );
  return r.rows.length > 0;
}

export async function reverseJournalEntry(
  client: pg.PoolClient,
  tenantId: string,
  originalJournalEntryId: string,
  reason: string,
  createdBy: string | null
): Promise<{ reversalJournalEntryId: string }> {
  if (!reason?.trim()) throw new Error('Reversal reason is required.');

  const existing = await getJournalWithLines(client, originalJournalEntryId, tenantId);
  if (!existing) throw new Error('Original journal entry not found.');

  if (await isJournalReversed(client, originalJournalEntryId)) {
    throw new Error('This journal entry has already been reversed.');
  }

  const lineInputs: JournalLineInput[] = existing.lines.map((row: Record<string, unknown>) => ({
    accountId: String(row.account_id),
    debitAmount: Number(row.debit_amount),
    creditAmount: Number(row.credit_amount),
  }));
  const swapped = swapLinesForReversal(lineInputs);
  const verr = validateBalanced(swapped);
  if (verr) throw new Error(verr);

  await assertAccountsExist(
    client,
    tenantId,
    swapped.map((l) => l.accountId)
  );

  const reversalJournalEntryId = newId();
  const reversalInput: CreateJournalBody = {
    entryDate: todayUtcYyyyMmDd(),
    reference: `REV:${originalJournalEntryId}`,
    description: `Reversal of ${originalJournalEntryId}: ${reason.trim()}`,
    sourceModule: 'reversal',
    sourceId: originalJournalEntryId,
    createdBy,
    lines: swapped,
  };

  await insertJournalEntry(client, tenantId, reversalInput, reversalJournalEntryId);

  const reversalLinkId = newId();
  await client.query(
    `INSERT INTO journal_reversals (id, tenant_id, original_journal_entry_id, reversal_journal_entry_id, reason, created_at, created_by)
     VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
    [reversalLinkId, tenantId, originalJournalEntryId, reversalJournalEntryId, reason.trim(), createdBy]
  );

  const auditId = newId();
  const auditNew = JSON.stringify({
    originalJournalEntryId,
    reversalJournalEntryId,
    reason: reason.trim(),
  });
  await client.query(
    `INSERT INTO accounting_audit_log (id, tenant_id, entity_type, entity_id, action, user_id, timestamp, old_value, new_value)
     VALUES ($1, $2, 'journal_reversal', $3, 'reverse', $4, NOW(), $5, $6)`,
    [
      auditId,
      tenantId,
      originalJournalEntryId,
      createdBy,
      JSON.stringify({ id: originalJournalEntryId }),
      auditNew,
    ]
  );

  return { reversalJournalEntryId };
}

function normalBalanceDirection(accountType: string): 1 | -1 {
  const t = (accountType || '').toLowerCase();
  if (t === 'asset' || t === 'expense') return 1;
  return -1;
}

export type TrialBalanceReportRow = {
  account_id: string;
  account_name: string;
  account_type: string;
  total_debit: number;
  total_credit: number;
};

export async function getTrialBalanceReport(
  client: pg.PoolClient,
  tenantId: string,
  options?: { fromDate?: string; toDate?: string }
): Promise<TrialBalanceReportRow[]> {
  const params: unknown[] = [tenantId, GLOBAL_SYSTEM_TENANT_ID];
  let cond = '';
  if (options?.fromDate) {
    cond += ` AND je.entry_date >= $${params.length + 1}`;
    params.push(options.fromDate);
  }
  if (options?.toDate) {
    cond += ` AND je.entry_date <= $${params.length + 1}`;
    params.push(options.toDate);
  }
  const r = await client.query(
    `SELECT
      jl.account_id AS account_id,
      a.name AS account_name,
      a.type AS account_type,
      COALESCE(SUM(jl.debit_amount), 0)::float AS total_debit,
      COALESCE(SUM(jl.credit_amount), 0)::float AS total_credit
    FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    INNER JOIN accounts a ON a.id = jl.account_id AND (a.tenant_id = je.tenant_id OR a.tenant_id = $2)
    WHERE je.tenant_id = $1${cond}
    GROUP BY jl.account_id, a.name, a.type
    ORDER BY a.type, a.name`,
    params
  );
  return r.rows as TrialBalanceReportRow[];
}

export type GeneralLedgerReportRow = {
  entry_date: string;
  journal_entry_id: string;
  reference: string;
  description: string | null;
  line_number: number;
  debit_amount: number;
  credit_amount: number;
  running_balance: number;
};

export async function getGeneralLedgerReport(
  client: pg.PoolClient,
  accountId: string,
  tenantId: string,
  options?: { fromDate?: string; toDate?: string }
): Promise<{ accountType: string; accountName: string; rows: GeneralLedgerReportRow[] }> {
  const acc = await client.query(
    `SELECT type, name FROM accounts WHERE id = $1 AND (tenant_id = $2 OR tenant_id = $3) AND deleted_at IS NULL`,
    [accountId, tenantId, GLOBAL_SYSTEM_TENANT_ID]
  );
  if (acc.rows.length === 0) throw new Error('Account not found.');
  const accountType = String((acc.rows[0] as { type: string }).type);
  const accountName = String((acc.rows[0] as { name: string }).name);
  const dir = normalBalanceDirection(accountType);

  const params: unknown[] = [accountId, tenantId];
  let cond = '';
  if (options?.fromDate) {
    cond += ` AND je.entry_date >= $${params.length + 1}`;
    params.push(options.fromDate);
  }
  if (options?.toDate) {
    cond += ` AND je.entry_date <= $${params.length + 1}`;
    params.push(options.toDate);
  }

  const r = await client.query(
    `SELECT
      je.entry_date AS entry_date,
      je.id AS journal_entry_id,
      je.reference AS reference,
      je.description AS description,
      jl.line_number AS line_number,
      jl.debit_amount AS debit_amount,
      jl.credit_amount AS credit_amount
    FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.account_id = $1 AND je.tenant_id = $2${cond}
    ORDER BY je.entry_date ASC, je.id ASC, jl.line_number ASC`,
    params
  );

  let running = 0;
  const rows: GeneralLedgerReportRow[] = (r.rows as Record<string, unknown>[]).map((raw) => {
    const debit = roundMoney(Number(raw.debit_amount));
    const credit = roundMoney(Number(raw.credit_amount));
    const delta = dir * (debit - credit);
    running = roundMoney(running + delta);
    return {
      entry_date: String(raw.entry_date),
      journal_entry_id: String(raw.journal_entry_id),
      reference: String(raw.reference ?? ''),
      description: raw.description != null ? String(raw.description) : null,
      line_number: Number(raw.line_number),
      debit_amount: debit,
      credit_amount: credit,
      running_balance: running,
    };
  });

  return { accountType, accountName, rows };
}
