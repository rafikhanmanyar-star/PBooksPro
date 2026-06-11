import type pg from 'pg';
import {
  JournalRepository,
  type CreateJournalBody,
  type InvestorTransactionType,
} from '../modules/accounting/repositories/JournalRepository.js';

export type { CreateJournalBody, InvestorTransactionType };

export async function insertJournalEntry(
  client: pg.PoolClient,
  tenantId: string,
  input: CreateJournalBody,
  journalEntryIdOverride?: string,
  options?: { allowClosedPeriod?: boolean }
): Promise<{ journalEntryId: string }> {
  return new JournalRepository(tenantId).insertEntry(client, input, journalEntryIdOverride, options);
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
  return new JournalRepository(tenantId).getWithLines(client, journalEntryId);
}

export async function isJournalReversed(
  client: pg.PoolClient,
  originalJournalEntryId: string,
  tenantId?: string
): Promise<boolean> {
  if (!tenantId) {
    return JournalRepository.isReversedGlobal(client, originalJournalEntryId);
  }
  return new JournalRepository(tenantId).isReversed(client, originalJournalEntryId);
}

export async function reverseJournalEntry(
  client: pg.PoolClient,
  tenantId: string,
  originalJournalEntryId: string,
  reason: string,
  createdBy: string | null
): Promise<{ reversalJournalEntryId: string }> {
  return new JournalRepository(tenantId).reverseEntry(client, originalJournalEntryId, reason, createdBy);
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
  return new JournalRepository(tenantId).getTrialBalanceReport(client, options);
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
  is_brought_forward?: boolean;
};

export async function getGeneralLedgerReport(
  client: pg.PoolClient,
  accountId: string,
  tenantId: string,
  options?: { fromDate?: string; toDate?: string }
): Promise<{ accountType: string; accountName: string; rows: GeneralLedgerReportRow[] }> {
  return new JournalRepository(tenantId).getGeneralLedgerReport(client, accountId, options);
}
