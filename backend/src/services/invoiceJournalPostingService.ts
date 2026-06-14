/**
 * Mirror issued invoices into journal_entries / journal_lines (Dr AR / Cr revenue or security liability).
 */
import type pg from 'pg';
import { formatPgDateToYyyyMmDd } from '../utils/dateOnly.js';
import { roundMoney, type JournalLineInput } from '../financial/validation.js';
import {
  entryDimensionsFrom,
  journalLineWithDimensions,
  resolveJournalDimensions,
} from '../financial/journalDimensions.js';
import { type CreateJournalBody } from './journalService.js';
import { createFinancialPostingService } from '../modules/accounting/services/FinancialPostingService.js';
import type { InvoiceRow } from './invoicesService.js';

export const INVOICE_JOURNAL_SOURCE_MODULE = 'invoice';

const SYS_AR = 'sys-acc-ar';
const SYS_INCOME_SUMMARY = 'sys-acc-income-summary';
const SYS_SEC_LIABILITY = 'sys-acc-sec-liability';

function invoiceDateYmd(row: InvoiceRow): string {
  return formatPgDateToYyyyMmDd(row.issue_date as Date | string);
}

export function shouldSkipInvoiceJournalMirror(row: Pick<InvoiceRow, 'status' | 'description' | 'amount' | 'deleted_at'>): boolean {
  if (row.deleted_at) return true;
  if (String(row.status ?? '').trim() === 'Draft') return true;
  const desc = String(row.description ?? '');
  if (desc.includes('VOIDED')) return true;
  if (roundMoney(Math.abs(Number(row.amount))) < 0.005) return true;
  return false;
}

export function isSecurityDepositInvoice(row: Pick<InvoiceRow, 'invoice_type' | 'description'>): boolean {
  const t = String(row.invoice_type ?? '').trim();
  if (t === 'Security Deposit') return true;
  const desc = String(row.description ?? '');
  return desc.includes('[Security]') || desc.toLowerCase().includes('security deposit');
}

export function buildJournalLinesFromInvoice(row: InvoiceRow): JournalLineInput[] | null {
  if (shouldSkipInvoiceJournalMirror(row)) return null;
  const M = roundMoney(Math.abs(Number(row.amount)));
  if (M < 0.005) return null;

  const dims = resolveJournalDimensions(row);
  const creditAccount = isSecurityDepositInvoice(row) ? SYS_SEC_LIABILITY : SYS_INCOME_SUMMARY;

  return [
    journalLineWithDimensions({ accountId: SYS_AR, debitAmount: M, creditAmount: 0 }, dims),
    journalLineWithDimensions({ accountId: creditAccount, debitAmount: 0, creditAmount: M }, dims),
  ];
}

export function buildJournalBodyFromInvoice(row: InvoiceRow, lines: JournalLineInput[]): CreateJournalBody {
  const desc =
    (row.description && String(row.description).trim()) ||
    `Invoice ${row.invoice_number} (${row.invoice_type})`;
  const dims = resolveJournalDimensions(row);
  return {
    entryDate: invoiceDateYmd(row),
    reference: `INV:${row.invoice_number}`,
    description: desc,
    sourceModule: INVOICE_JOURNAL_SOURCE_MODULE,
    sourceId: row.id,
    createdBy: row.user_id,
    ...entryDimensionsFrom(dims),
    lines,
  };
}

async function findActiveJournalEntryIdForInvoice(
  client: pg.PoolClient,
  tenantId: string,
  invoiceId: string
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
    [tenantId, INVOICE_JOURNAL_SOURCE_MODULE, invoiceId]
  );
  return r.rows[0]?.id ?? null;
}

export async function syncInvoiceJournalMirror(
  client: pg.PoolClient,
  tenantId: string,
  row: InvoiceRow,
  actorUserId: string | null,
  options?: { replaceExisting?: boolean }
): Promise<{ journalEntryId: string | null }> {
  return createFinancialPostingService(tenantId).postFromInvoice(client, row, actorUserId, options);
}

export async function reverseInvoiceJournalMirror(
  client: pg.PoolClient,
  tenantId: string,
  invoiceId: string,
  actorUserId: string | null
): Promise<void> {
  await createFinancialPostingService(tenantId).reverseInvoiceMirror(client, invoiceId, actorUserId);
}

export async function ensureInvoiceJournalMirror(
  client: pg.PoolClient,
  tenantId: string,
  row: InvoiceRow,
  actorUserId: string | null
): Promise<{ journalEntryId: string | null; skipped: 'mirror_rule' | 'no_lines' | 'already_posted' | null }> {
  if (shouldSkipInvoiceJournalMirror(row)) {
    return { journalEntryId: null, skipped: 'mirror_rule' };
  }
  if (await findActiveJournalEntryIdForInvoice(client, tenantId, row.id)) {
    return { journalEntryId: null, skipped: 'already_posted' };
  }
  const lines = buildJournalLinesFromInvoice(row);
  if (!lines) return { journalEntryId: null, skipped: 'no_lines' };
  const body = buildJournalBodyFromInvoice(row, lines);
  const { journalEntryId } = await createFinancialPostingService(tenantId).postJournal(client, body, {
    actorUserId,
  });
  return { journalEntryId, skipped: null };
}
