/**
 * Mirror operational transactions into journal_entries / journal_lines (Phase A ledger unification).
 * Uses sys-acc-clearing for P&L counterparty legs (matches client trialBalanceFromTransactions).
 */
import type pg from 'pg';
import { formatPgDateToYyyyMmDd } from '../../../utils/dateOnly.js';
import { roundMoney, type JournalLineInput } from '../../../financial/validation.js';
import {
  entryDimensionsFrom,
  journalLineWithDimensions,
  resolveJournalDimensions,
} from '../../../financial/journalDimensions.js';
import { type CreateJournalBody } from './journalService.js';
import { createFinancialPostingService } from './FinancialPostingService.js';
import type { TransactionRow } from './transactionsService.js';
import { isVendorSettlementCashMirrorReference } from '../../../constants/vendorSettlement.js';

export const TRANSACTION_JOURNAL_SOURCE_MODULE = 'transaction';

/** Canonical system account ids (tenantBootstrap SYSTEM_ACCOUNT_DEFS). */
const SYS_AR = 'sys-acc-ar';
const SYS_AP = 'sys-acc-ap';
const SYS_CLEARING = 'sys-acc-clearing';
const SYS_INCOME_SUMMARY = 'sys-acc-income-summary';
const SYS_EXPENSE_SUMMARY = 'sys-acc-expense-summary';

const EQ_SUB_INVESTMENT = 'equity_investment';
const EQ_SUB_WITHDRAWAL = 'equity_withdrawal';

function txDateYmd(row: TransactionRow): string {
  return formatPgDateToYyyyMmDd(row.date as Date | string);
}

export function shouldSkipTransactionJournalMirror(row: Pick<TransactionRow, 'id' | 'reference' | 'is_system' | 'subtype'>): boolean {
  if (isVendorSettlementCashMirrorReference(row.reference)) return true;
  if (String(row.id).startsWith('invj_tx_')) return true;
  const st = String(row.subtype ?? '');
  if (row.is_system && (st === EQ_SUB_INVESTMENT || st === EQ_SUB_WITHDRAWAL)) return true;
  return false;
}

async function findActiveJournalEntryIdForTransaction(
  client: pg.PoolClient,
  tenantId: string,
  transactionId: string
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
    [tenantId, TRANSACTION_JOURNAL_SOURCE_MODULE, transactionId]
  );
  return r.rows[0]?.id ?? null;
}

export function buildJournalLinesFromTransaction(row: TransactionRow): JournalLineInput[] | null {
  const M = roundMoney(Math.abs(Number(row.amount)));
  if (M < 0.005) return null;

  const dims = resolveJournalDimensions(row);
  const type = String(row.type ?? '').trim();

  if (type.toLowerCase() === 'income') {
    const creditAccount = row.invoice_id ? SYS_AR : SYS_INCOME_SUMMARY;
    return [
      journalLineWithDimensions({ accountId: row.account_id, debitAmount: M, creditAmount: 0 }, dims),
      journalLineWithDimensions({ accountId: creditAccount, debitAmount: 0, creditAmount: M }, dims),
    ];
  }

  if (type.toLowerCase() === 'expense') {
    const debitAccount = row.bill_id ? SYS_AP : SYS_EXPENSE_SUMMARY;
    return [
      journalLineWithDimensions({ accountId: debitAccount, debitAmount: M, creditAmount: 0 }, dims),
      journalLineWithDimensions({ accountId: row.account_id, debitAmount: 0, creditAmount: M }, dims),
    ];
  }

  if (type.toLowerCase() === 'transfer') {
    const fromId = row.from_account_id && String(row.from_account_id).trim();
    const toId = row.to_account_id && String(row.to_account_id).trim();
    if (!fromId || !toId) return null;
    return [
      journalLineWithDimensions({ accountId: toId, debitAmount: M, creditAmount: 0 }, dims),
      journalLineWithDimensions({ accountId: fromId, debitAmount: 0, creditAmount: M }, dims),
    ];
  }

  if (type.toLowerCase() === 'loan') {
    const st = String(row.subtype ?? '');
    const isIn =
      st.includes('Receive') ||
      st.includes('Collect') ||
      st.toLowerCase() === 'receive' ||
      st.toLowerCase() === 'collect';
    const isOut =
      st.includes('Give') ||
      st.includes('Repay') ||
      st.toLowerCase() === 'give' ||
      st.toLowerCase() === 'repay';
    if (isIn) {
      return [
        journalLineWithDimensions({ accountId: row.account_id, debitAmount: M, creditAmount: 0 }, dims),
        journalLineWithDimensions({ accountId: SYS_CLEARING, debitAmount: 0, creditAmount: M }, dims),
      ];
    }
    if (isOut) {
      return [
        journalLineWithDimensions({ accountId: SYS_CLEARING, debitAmount: M, creditAmount: 0 }, dims),
        journalLineWithDimensions({ accountId: row.account_id, debitAmount: 0, creditAmount: M }, dims),
      ];
    }
  }

  return null;
}

export function buildJournalBodyFromTransaction(row: TransactionRow, lines: JournalLineInput[]): CreateJournalBody {
  const desc =
    (row.description && String(row.description).trim()) ||
    `${row.type} ${Number(row.amount)}`;
  const dims = resolveJournalDimensions(row);
  return {
    entryDate: txDateYmd(row),
    reference: row.reference?.trim() ? String(row.reference).trim() : `TX:${row.id}`,
    description: desc,
    sourceModule: TRANSACTION_JOURNAL_SOURCE_MODULE,
    sourceId: row.id,
    createdBy: row.user_id,
    ...entryDimensionsFrom(dims),
    lines,
  };
}

/**
 * Create or replace the journal mirror for a live transaction row.
 * On update: reverses prior entry then posts a new one.
 */
export async function syncTransactionJournalMirror(
  client: pg.PoolClient,
  tenantId: string,
  row: TransactionRow,
  actorUserId: string | null,
  options?: { replaceExisting?: boolean }
): Promise<{ journalEntryId: string | null }> {
  if (shouldSkipTransactionJournalMirror(row)) {
    return { journalEntryId: null };
  }
  return createFinancialPostingService(tenantId).postFromTransaction(client, row, actorUserId, options);
}

/** Reverse journal mirror when a transaction is soft-deleted. */
export async function reverseTransactionJournalMirror(
  client: pg.PoolClient,
  tenantId: string,
  transactionId: string,
  actorUserId: string | null
): Promise<void> {
  await createFinancialPostingService(tenantId).reverseTransactionMirror(
    client,
    transactionId,
    actorUserId
  );
}

/** True when a non-reversed journal entry already mirrors this transaction. */
export async function hasActiveTransactionJournalMirror(
  client: pg.PoolClient,
  tenantId: string,
  transactionId: string
): Promise<boolean> {
  const id = await findActiveJournalEntryIdForTransaction(client, tenantId, transactionId);
  return id != null;
}

/**
 * Post journal mirror only when missing (no reversal of existing entries).
 * Used by backfill and idempotent repair jobs.
 */
export async function ensureTransactionJournalMirror(
  client: pg.PoolClient,
  tenantId: string,
  row: TransactionRow,
  actorUserId: string | null
): Promise<{ journalEntryId: string | null; skipped: 'mirror_rule' | 'no_lines' | 'already_posted' | null }> {
  if (shouldSkipTransactionJournalMirror(row)) {
    return { journalEntryId: null, skipped: 'mirror_rule' };
  }
  if (await hasActiveTransactionJournalMirror(client, tenantId, row.id)) {
    return { journalEntryId: null, skipped: 'already_posted' };
  }
  const lines = buildJournalLinesFromTransaction(row);
  if (!lines) {
    return { journalEntryId: null, skipped: 'no_lines' };
  }
  const body = buildJournalBodyFromTransaction(row, lines);
  const { journalEntryId } = await createFinancialPostingService(tenantId).postJournal(client, body, {
    actorUserId,
  });
  return { journalEntryId, skipped: null };
}
