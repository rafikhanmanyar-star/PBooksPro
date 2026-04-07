/**
 * Canonical double-entry write path: journal_entries + journal_lines + accounting_audit_log.
 * Local: sqliteBridge.transaction (BEGIN IMMEDIATE). LAN/API: POST /api/transactions/journal.
 */

import type { CreateJournalEntryInput, JournalLineInput, JournalEntryRow, JournalLineRow } from './types';
import { roundMoney, validateBalanced, swapLinesForReversal } from './validation';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { journalApi } from '../api/journalApi';
import { todayLocalYyyyMmDd } from '../../utils/dateUtils';

function getBridge() {
  if (typeof window === 'undefined' || !window.sqliteBridge?.transaction) {
    throw new Error('Financial journal engine requires Electron SQLite bridge (window.sqliteBridge.transaction).');
  }
  return window.sqliteBridge;
}

export function newJournalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `je_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

async function assertAccountsExistForTenant(tenantId: string, accountIds: string[]): Promise<void> {
  if (accountIds.length === 0) {
    throw new Error('No accounts specified.');
  }
  const bridge = getBridge();
  const uniq = [...new Set(accountIds)];
  const ph = uniq.map(() => '?').join(',');
  const r = await bridge.query(
    `SELECT id FROM accounts WHERE id IN (${ph}) AND deleted_at IS NULL AND tenant_id = ?`,
    [...uniq, tenantId]
  );
  if (!r.ok) throw new Error(r.error || 'Failed to validate accounts');
  const rows = (r.rows || []) as { id: string }[];
  const found = new Set(rows.map((x) => x.id));
  for (const id of uniq) {
    if (!found.has(id)) {
      throw new Error(`Account not found for this tenant or inactive: ${id}`);
    }
  }
}

type TxOp = { type: 'run'; sql: string; params?: unknown[] };

function buildInsertJournalOps(
  journalEntryId: string,
  tenantId: string,
  input: CreateJournalEntryInput,
  lines: JournalLineInput[]
): TxOp[] {
  const ops: TxOp[] = [];
  ops.push({
    type: 'run',
    sql: `INSERT INTO journal_entries (id, tenant_id, entry_date, reference, description, source_module, source_id, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    params: [
      journalEntryId,
      tenantId,
      input.entryDate,
      input.reference ?? '',
      input.description ?? null,
      input.sourceModule ?? null,
      input.sourceId ?? null,
      input.createdBy ?? null,
    ],
  });

  lines.forEach((line, idx) => {
    const lineId = newJournalId();
    const d = roundMoney(line.debitAmount);
    const c = roundMoney(line.creditAmount);
    ops.push({
      type: 'run',
      sql: `INSERT INTO journal_lines (id, journal_entry_id, account_id, debit_amount, credit_amount, line_number)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [lineId, journalEntryId, line.accountId, d, c, idx],
    });
  });

  const auditId = newJournalId();
  const auditPayload = JSON.stringify({
    journalEntryId,
    entryDate: input.entryDate,
    reference: input.reference,
    sourceModule: input.sourceModule,
    sourceId: input.sourceId,
    lines: lines.map((l) => ({
      accountId: l.accountId,
      debitAmount: roundMoney(l.debitAmount),
      creditAmount: roundMoney(l.creditAmount),
    })),
  });
  ops.push({
    type: 'run',
    sql: `INSERT INTO accounting_audit_log (id, tenant_id, entity_type, entity_id, action, user_id, timestamp, old_value, new_value)
          VALUES (?, ?, 'journal_entry', ?, 'create', ?, datetime('now'), NULL, ?)`,
    params: [auditId, tenantId, journalEntryId, input.createdBy ?? null, auditPayload],
  });

  return ops;
}

/**
 * Create a balanced journal entry. This is the primary API for posting GL.
 * Alias: {@link createTransaction} (spec naming).
 */
export async function createJournalEntry(input: CreateJournalEntryInput): Promise<{ journalEntryId: string }> {
  const err = validateBalanced(input.lines);
  if (err) throw new Error(err);

  if (!isLocalOnlyMode()) {
    return journalApi.createJournalEntry(input);
  }

  const tenantId = input.tenantId ?? '';
  await assertAccountsExistForTenant(tenantId, input.lines.map((l) => l.accountId));

  const journalEntryId = newJournalId();
  const ops = buildInsertJournalOps(journalEntryId, tenantId, input, input.lines);

  const r = await getBridge().transaction(ops);
  if (!r.ok) throw new Error(r.error || 'Journal entry commit failed');

  return { journalEntryId };
}

export const createTransaction = createJournalEntry;

/**
 * Load journal entry header + lines (read-only; for preview / reporting).
 */
export async function getJournalEntryWithLines(
  journalEntryId: string,
  tenantId: string
): Promise<{ entry: JournalEntryRow; lines: JournalLineRow[] } | null> {
  if (!isLocalOnlyMode()) {
    const raw = await journalApi.getJournalEntryWithLines(journalEntryId);
    if (!raw) return null;
    const e = raw.entry as unknown as JournalEntryRow;
    const lines = (raw.lines || []) as unknown as JournalLineRow[];
    return { entry: e, lines };
  }

  const bridge = getBridge();
  const e = await bridge.query(
    `SELECT id, tenant_id, entry_date, reference, description, source_module, source_id, created_by, created_at
     FROM journal_entries WHERE id = ? AND tenant_id = ?`,
    [journalEntryId, tenantId]
  );
  if (!e.ok || !e.rows?.length) return null;
  const entry = e.rows[0] as JournalEntryRow;
  const l = await bridge.query(
    `SELECT id, journal_entry_id, account_id, debit_amount, credit_amount, line_number
     FROM journal_lines WHERE journal_entry_id = ? ORDER BY line_number ASC`,
    [journalEntryId]
  );
  if (!l.ok) return null;
  return { entry, lines: (l.rows || []) as JournalLineRow[] };
}

/**
 * True if this journal was already reversed (one reversal per original).
 */
export async function isJournalReversed(originalJournalEntryId: string): Promise<boolean> {
  if (!isLocalOnlyMode()) {
    return journalApi.isJournalReversed(originalJournalEntryId);
  }

  const bridge = getBridge();
  const r = await bridge.query(
    `SELECT 1 FROM journal_reversals WHERE original_journal_entry_id = ? LIMIT 1`,
    [originalJournalEntryId]
  );
  return !!(r.ok && r.rows?.length);
}

/**
 * Post a reversing entry (debit/credit swapped) and link via journal_reversals.
 */
export async function reverseJournalEntry(
  originalJournalEntryId: string,
  tenantId: string,
  reason: string,
  createdBy: string | null
): Promise<{ reversalJournalEntryId: string }> {
  if (!isLocalOnlyMode()) {
    return journalApi.reverseJournalEntry(originalJournalEntryId, reason);
  }

  if (!reason?.trim()) throw new Error('Reversal reason is required.');

  const existing = await getJournalEntryWithLines(originalJournalEntryId, tenantId);
  if (!existing) throw new Error('Original journal entry not found.');

  if (await isJournalReversed(originalJournalEntryId)) {
    throw new Error('This journal entry has already been reversed.');
  }

  const lineInputs: JournalLineInput[] = existing.lines.map((row) => ({
    accountId: row.account_id,
    debitAmount: row.debit_amount,
    creditAmount: row.credit_amount,
  }));
  const swapped = swapLinesForReversal(lineInputs);
  const err = validateBalanced(swapped);
  if (err) throw new Error(err);

  await assertAccountsExistForTenant(
    tenantId,
    swapped.map((l) => l.accountId)
  );

  const reversalJournalEntryId = newJournalId();
  const reversalInput: CreateJournalEntryInput = {
    tenantId,
    entryDate: todayLocalYyyyMmDd(),
    reference: `REV:${originalJournalEntryId}`,
    description: `Reversal of ${originalJournalEntryId}: ${reason.trim()}`,
    sourceModule: 'reversal',
    sourceId: originalJournalEntryId,
    createdBy,
    lines: swapped,
  };

  const ops = buildInsertJournalOps(reversalJournalEntryId, tenantId, reversalInput, swapped);

  const reversalLinkId = newJournalId();
  ops.push({
    type: 'run',
    sql: `INSERT INTO journal_reversals (id, tenant_id, original_journal_entry_id, reversal_journal_entry_id, reason, created_at, created_by)
          VALUES (?, ?, ?, ?, ?, datetime('now'), ?)`,
    params: [reversalLinkId, tenantId, originalJournalEntryId, reversalJournalEntryId, reason.trim(), createdBy],
  });

  const auditId = newJournalId();
  const auditNew = JSON.stringify({
    originalJournalEntryId,
    reversalJournalEntryId,
    reason: reason.trim(),
  });
  ops.push({
    type: 'run',
    sql: `INSERT INTO accounting_audit_log (id, tenant_id, entity_type, entity_id, action, user_id, timestamp, old_value, new_value)
          VALUES (?, ?, 'journal_reversal', ?, 'reverse', ?, datetime('now'), ?, ?)`,
    params: [auditId, tenantId, originalJournalEntryId, createdBy, JSON.stringify({ id: originalJournalEntryId }), auditNew],
  });

  const r = await getBridge().transaction(ops);
  if (!r.ok) throw new Error(r.error || 'Reversal commit failed');

  return { reversalJournalEntryId };
}

export const reverseTransaction = reverseJournalEntry;
