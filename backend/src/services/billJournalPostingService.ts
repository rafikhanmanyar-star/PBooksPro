/**
 * Mirror issued bills into journal_entries / journal_lines (Dr expense summary / Cr AP).
 */
import type pg from 'pg';
import { formatPgDateToYyyyMmDd } from '../utils/dateOnly.js';
import { roundMoney, type JournalLineInput } from '../financial/validation.js';
import { insertJournalEntry, reverseJournalEntry, type CreateJournalBody } from './journalService.js';
import type { BillRow } from './billsService.js';

export const BILL_JOURNAL_SOURCE_MODULE = 'bill';

const SYS_AP = 'sys-acc-ap';
const SYS_EXPENSE_SUMMARY = 'sys-acc-expense-summary';

function billDateYmd(row: BillRow): string {
  return formatPgDateToYyyyMmDd(row.issue_date as Date | string);
}

function billProjectId(row: BillRow): string | null {
  const p = row.project_id;
  return p != null && String(p).trim() !== '' ? String(p).trim() : null;
}

export function shouldSkipBillJournalMirror(row: Pick<BillRow, 'status' | 'description' | 'amount' | 'deleted_at'>): boolean {
  if (row.deleted_at) return true;
  if (String(row.status ?? '').trim() === 'Draft') return true;
  const desc = String(row.description ?? '');
  if (desc.includes('VOIDED')) return true;
  if (roundMoney(Math.abs(Number(row.amount))) < 0.005) return true;
  return false;
}

export function buildJournalLinesFromBill(row: BillRow): JournalLineInput[] | null {
  if (shouldSkipBillJournalMirror(row)) return null;
  const M = roundMoney(Math.abs(Number(row.amount)));
  if (M < 0.005) return null;

  const projectId = billProjectId(row);
  return [
    { accountId: SYS_EXPENSE_SUMMARY, debitAmount: M, creditAmount: 0, projectId },
    { accountId: SYS_AP, debitAmount: 0, creditAmount: M, projectId },
  ];
}

function buildJournalBodyFromBill(row: BillRow, lines: JournalLineInput[]): CreateJournalBody {
  const desc =
    (row.description && String(row.description).trim()) ||
    `Bill ${row.bill_number}`;
  return {
    entryDate: billDateYmd(row),
    reference: `BILL:${row.bill_number}`,
    description: desc,
    sourceModule: BILL_JOURNAL_SOURCE_MODULE,
    sourceId: row.id,
    createdBy: row.user_id,
    projectId: billProjectId(row),
    lines,
  };
}

async function findActiveJournalEntryIdForBill(
  client: pg.PoolClient,
  tenantId: string,
  billId: string
): Promise<string | null> {
  const r = await client.query<{ id: string }>(
    `SELECT je.id FROM journal_entries je
     WHERE je.tenant_id = $1 AND je.source_module = $2 AND je.source_id = $3
       AND NOT EXISTS (
         SELECT 1 FROM journal_reversals jr
         WHERE jr.original_journal_entry_id = je.id AND jr.tenant_id = $1
       )
     ORDER BY je.created_at DESC, je.id DESC
     LIMIT 1`,
    [tenantId, BILL_JOURNAL_SOURCE_MODULE, billId]
  );
  return r.rows[0]?.id ?? null;
}

async function reverseExistingBillJournalIfAny(
  client: pg.PoolClient,
  tenantId: string,
  billId: string,
  actorUserId: string | null
): Promise<void> {
  const existingId = await findActiveJournalEntryIdForBill(client, tenantId, billId);
  if (!existingId) return;
  await reverseJournalEntry(client, tenantId, existingId, 'Bill updated or removed', actorUserId);
}

export async function syncBillJournalMirror(
  client: pg.PoolClient,
  tenantId: string,
  row: BillRow,
  actorUserId: string | null,
  options?: { replaceExisting?: boolean }
): Promise<{ journalEntryId: string | null }> {
  if (shouldSkipBillJournalMirror(row)) {
    await reverseExistingBillJournalIfAny(client, tenantId, row.id, actorUserId);
    return { journalEntryId: null };
  }

  const replace = options?.replaceExisting !== false;
  if (replace) {
    await reverseExistingBillJournalIfAny(client, tenantId, row.id, actorUserId);
  }

  const lines = buildJournalLinesFromBill(row);
  if (!lines) return { journalEntryId: null };

  const body = buildJournalBodyFromBill(row, lines);
  const { journalEntryId } = await insertJournalEntry(client, tenantId, body);
  return { journalEntryId };
}

export async function reverseBillJournalMirror(
  client: pg.PoolClient,
  tenantId: string,
  billId: string,
  actorUserId: string | null
): Promise<void> {
  await reverseExistingBillJournalIfAny(client, tenantId, billId, actorUserId);
}

export async function ensureBillJournalMirror(
  client: pg.PoolClient,
  tenantId: string,
  row: BillRow,
  actorUserId: string | null
): Promise<{ journalEntryId: string | null; skipped: 'mirror_rule' | 'no_lines' | 'already_posted' | null }> {
  if (shouldSkipBillJournalMirror(row)) {
    return { journalEntryId: null, skipped: 'mirror_rule' };
  }
  if (await findActiveJournalEntryIdForBill(client, tenantId, row.id)) {
    return { journalEntryId: null, skipped: 'already_posted' };
  }
  const lines = buildJournalLinesFromBill(row);
  if (!lines) return { journalEntryId: null, skipped: 'no_lines' };
  const body = buildJournalBodyFromBill(row, lines);
  const { journalEntryId } = await insertJournalEntry(client, tenantId, body);
  return { journalEntryId, skipped: null };
}
