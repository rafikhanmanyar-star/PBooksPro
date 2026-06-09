/**
 * Journal mirror for posted project expense vouchers (Dr expense GL / Cr payment source).
 */
import type pg from 'pg';
import { formatPgDateToYyyyMmDd } from '../utils/dateOnly.js';
import { roundMoney, type JournalLineInput } from '../financial/validation.js';
import { insertJournalEntry, reverseJournalEntry, type CreateJournalBody } from './journalService.js';
import type { ProjectExpenseVoucherRow } from './projectExpenseVoucherService.js';

export const PEV_JOURNAL_SOURCE_MODULE = 'project_expense_voucher';

export type PeVCategoryGlRow = {
  gl_account_id: string;
};

export function shouldSkipPeVJournalMirror(
  row: Pick<ProjectExpenseVoucherRow, 'status' | 'amount' | 'deleted_at'>
): boolean {
  if (row.deleted_at) return true;
  if (String(row.status ?? '').trim() !== 'posted') return true;
  if (roundMoney(Math.abs(Number(row.amount))) < 0.005) return true;
  return false;
}

export function buildJournalLinesFromPeV(
  row: ProjectExpenseVoucherRow,
  expenseGlAccountId: string
): JournalLineInput[] | null {
  if (shouldSkipPeVJournalMirror(row)) return null;
  const M = roundMoney(Math.abs(Number(row.amount)));
  if (M < 0.005) return null;

  const projectId =
    row.project_id != null && String(row.project_id).trim() !== ''
      ? String(row.project_id).trim()
      : null;

  return [
    {
      accountId: expenseGlAccountId,
      debitAmount: M,
      creditAmount: 0,
      projectId,
    },
    {
      accountId: row.payment_source_account_id,
      debitAmount: 0,
      creditAmount: M,
      projectId,
    },
  ];
}

function voucherDateYmd(row: ProjectExpenseVoucherRow): string {
  return formatPgDateToYyyyMmDd(row.voucher_date as Date | string);
}

function buildJournalBodyFromPeV(
  row: ProjectExpenseVoucherRow,
  lines: JournalLineInput[]
): CreateJournalBody {
  const projectId =
    row.project_id != null && String(row.project_id).trim() !== ''
      ? String(row.project_id).trim()
      : null;
  const desc =
    (row.description && String(row.description).trim()) ||
    `Project expense voucher ${row.voucher_number}`;
  return {
    entryDate: voucherDateYmd(row),
    reference: `PEV:${row.voucher_number}`,
    description: desc,
    sourceModule: PEV_JOURNAL_SOURCE_MODULE,
    sourceId: row.id,
    createdBy: row.posted_by ?? row.created_by,
    projectId,
    lines,
  };
}

async function findActiveJournalEntryIdForPeV(
  client: pg.PoolClient,
  tenantId: string,
  voucherId: string
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
    [tenantId, PEV_JOURNAL_SOURCE_MODULE, voucherId]
  );
  return r.rows[0]?.id ?? null;
}

async function reverseExistingPeVJournalIfAny(
  client: pg.PoolClient,
  tenantId: string,
  voucherId: string,
  actorUserId: string | null
): Promise<void> {
  const existingId = await findActiveJournalEntryIdForPeV(client, tenantId, voucherId);
  if (!existingId) return;
  await reverseJournalEntry(client, tenantId, existingId, 'Project expense voucher reversed', actorUserId);
}

export async function syncPeVJournalMirror(
  client: pg.PoolClient,
  tenantId: string,
  row: ProjectExpenseVoucherRow,
  expenseGlAccountId: string,
  actorUserId: string | null,
  options?: { replaceExisting?: boolean }
): Promise<{ journalEntryId: string | null }> {
  if (shouldSkipPeVJournalMirror(row)) {
    await reverseExistingPeVJournalIfAny(client, tenantId, row.id, actorUserId);
    return { journalEntryId: null };
  }

  const replace = options?.replaceExisting !== false;
  if (replace) {
    await reverseExistingPeVJournalIfAny(client, tenantId, row.id, actorUserId);
  }

  const lines = buildJournalLinesFromPeV(row, expenseGlAccountId);
  if (!lines) return { journalEntryId: null };

  const body = buildJournalBodyFromPeV(row, lines);
  const { journalEntryId } = await insertJournalEntry(client, tenantId, body);
  return { journalEntryId };
}

export async function reversePeVJournalMirror(
  client: pg.PoolClient,
  tenantId: string,
  voucherId: string,
  actorUserId: string | null
): Promise<void> {
  await reverseExistingPeVJournalIfAny(client, tenantId, voucherId, actorUserId);
}
