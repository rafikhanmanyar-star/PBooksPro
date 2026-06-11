/**
 * Canonical investor postings (double-entry). Financial truth lives in journal_entries / journal_lines.
 */
import type pg from 'pg';
import { roundMoney } from '../financial/validation.js';
import { recordDomainMutation } from '../core/recordDomainMutation.js';
import {
  type CreateJournalBody,
  type InvestorTransactionType,
} from './journalService.js';
import { createFinancialPostingService } from '../modules/accounting/services/FinancialPostingService.js';
import { JournalRepository } from '../modules/accounting/repositories/JournalRepository.js';
import { createTransaction } from './transactionsService.js';

async function auditInvestorJournalEntry(
  client: pg.PoolClient,
  tenantId: string,
  journalEntryId: string,
  body: CreateJournalBody
): Promise<void> {
  const debitTotal = roundMoney(
    body.lines.reduce((sum, line) => sum + (line.debitAmount ?? 0), 0)
  );
  await recordDomainMutation(client, {
    tenantId,
    userId: body.createdBy ?? null,
    module: 'investor_module',
    entityType: 'investor_journal_entry',
    entityId: journalEntryId,
    action: 'create',
    auditAction: body.investorTransactionType ?? 'investor_posting',
    summary: body.description ?? 'Investor journal entry posted',
    newValue: {
      journalEntryId,
      entryDate: body.entryDate,
      reference: body.reference ?? undefined,
      projectId: body.projectId ?? undefined,
      investorId: body.investorId ?? undefined,
      investorTransactionType: body.investorTransactionType ?? undefined,
      amount: debitTotal,
    },
  });
}

async function postInvestorJournalEntry(
  client: pg.PoolClient,
  tenantId: string,
  body: CreateJournalBody
): Promise<{ journalEntryId: string }> {
  const result = await createFinancialPostingService(tenantId).postJournal(client, body, {
    actorUserId: body.createdBy,
  });
  await auditInvestorJournalEntry(client, tenantId, result.journalEntryId, body);
  return result;
}

/** Matches `EquityLedgerSubtype` in client `types.ts` — ledger UI reads `transactions`, not journal-only rows. */
const EQ_SUB_INVESTMENT = 'equity_investment';
const EQ_SUB_WITHDRAWAL = 'equity_withdrawal';

async function mirrorContributionToTransactionsRow(
  client: pg.PoolClient,
  tenantId: string,
  input: {
    journalEntryId: string;
    entryDate: string;
    amount: number;
    cashAccountId: string;
    investorEquityAccountId: string;
    projectId: string;
    description: string | null | undefined;
    reference: string | null | undefined;
    createdBy: string | null | undefined;
  }
): Promise<void> {
  const refBase = input.reference?.trim() ? input.reference.trim() : `JE:${input.journalEntryId}`;
  await createTransaction(
    client,
    tenantId,
    {
      id: `invj_tx_${input.journalEntryId}`,
      type: 'Transfer',
      subtype: EQ_SUB_INVESTMENT,
      amount: input.amount,
      date: input.entryDate,
      description: input.description ?? 'Investor contribution',
      reference: refBase,
      accountId: input.investorEquityAccountId,
      fromAccountId: input.investorEquityAccountId,
      toAccountId: input.cashAccountId,
      projectId: input.projectId,
      isSystem: true,
    },
    input.createdBy ?? null,
    { skipJournalMirror: true }
  );
}

async function mirrorWithdrawalToTransactionsRow(
  client: pg.PoolClient,
  tenantId: string,
  input: {
    journalEntryId: string;
    entryDate: string;
    amount: number;
    cashAccountId: string;
    investorEquityAccountId: string;
    projectId: string;
    description: string | null | undefined;
    reference: string | null | undefined;
    createdBy: string | null | undefined;
  }
): Promise<void> {
  const refBase = input.reference?.trim() ? input.reference.trim() : `JE:${input.journalEntryId}`;
  await createTransaction(
    client,
    tenantId,
    {
      id: `invj_tx_${input.journalEntryId}`,
      type: 'Transfer',
      subtype: EQ_SUB_WITHDRAWAL,
      amount: input.amount,
      date: input.entryDate,
      description: input.description ?? 'Investor withdrawal',
      reference: refBase,
      accountId: input.investorEquityAccountId,
      fromAccountId: input.cashAccountId,
      toAccountId: input.investorEquityAccountId,
      projectId: input.projectId,
      isSystem: true,
    },
    input.createdBy ?? null,
    { skipJournalMirror: true }
  );
}

/** Stored on journal_entries.investor_id (party/contact id preferred; else equity GL id). */
function investorMetadataId(partyId: string | null | undefined, equityAccountId: string): string {
  const p = partyId != null && String(partyId).trim() !== '' ? String(partyId).trim() : null;
  return p ?? equityAccountId;
}

/** Equity accounts: net balance = credits − debits through date (normal credit balance). */
export async function getEquityAccountBalanceThrough(
  client: pg.PoolClient,
  tenantId: string,
  equityAccountId: string,
  asOfYyyyMmDd: string
): Promise<number> {
  return new JournalRepository(tenantId).getEquityAccountBalanceThrough(
    client,
    equityAccountId,
    asOfYyyyMmDd
  );
}

/** Dr Cash / Cr Investor equity */
export async function postInvestorContribution(
  client: pg.PoolClient,
  tenantId: string,
  input: {
    entryDate: string;
    amount: number;
    cashAccountId: string;
    investorEquityAccountId: string;
    projectId: string;
    /** Optional contact/party id for reporting; else equity account id is stored. */
    investorPartyId?: string | null;
    description?: string;
    reference?: string;
    createdBy?: string | null;
  }
): Promise<{ journalEntryId: string }> {
  const amt = roundMoney(input.amount);
  if (amt <= 0) throw new Error('Amount must be positive.');
  const body: CreateJournalBody = {
    entryDate: input.entryDate,
    reference: input.reference ?? `INV-C-${Date.now()}`,
    description: input.description ?? 'Investor contribution',
    sourceModule: 'investor_module',
    sourceId: `contribution:${input.investorEquityAccountId}`,
    createdBy: input.createdBy ?? null,
    projectId: input.projectId,
    investorId: investorMetadataId(input.investorPartyId, input.investorEquityAccountId),
    investorTransactionType: 'investment' as InvestorTransactionType,
    lines: [
      { accountId: input.cashAccountId, debitAmount: amt, creditAmount: 0, projectId: input.projectId },
      {
        accountId: input.investorEquityAccountId,
        debitAmount: 0,
        creditAmount: amt,
        projectId: input.projectId,
      },
    ],
  };
  const { journalEntryId } = await postInvestorJournalEntry(client, tenantId, body);
  await mirrorContributionToTransactionsRow(client, tenantId, {
    journalEntryId,
    entryDate: input.entryDate,
    amount: amt,
    cashAccountId: input.cashAccountId,
    investorEquityAccountId: input.investorEquityAccountId,
    projectId: input.projectId,
    description: input.description,
    reference: input.reference ?? body.reference,
    createdBy: input.createdBy ?? null,
  });
  return { journalEntryId };
}

/** Dr Investor equity / Cr Cash — cash outflow */
export async function postInvestorWithdrawal(
  client: pg.PoolClient,
  tenantId: string,
  input: {
    entryDate: string;
    amount: number;
    cashAccountId: string;
    investorEquityAccountId: string;
    projectId: string;
    investorPartyId?: string | null;
    description?: string;
    reference?: string;
    createdBy?: string | null;
    skipBalanceCheck?: boolean;
  }
): Promise<{ journalEntryId: string }> {
  const amt = roundMoney(input.amount);
  if (amt <= 0) throw new Error('Amount must be positive.');
  if (!input.skipBalanceCheck) {
    const bal = await getEquityAccountBalanceThrough(
      client,
      tenantId,
      input.investorEquityAccountId,
      input.entryDate
    );
    if (bal + 0.005 < amt) {
      throw new Error(
        `Withdrawal ${amt.toFixed(2)} exceeds investor equity balance ${bal.toFixed(2)} (through ${input.entryDate}).`
      );
    }
  }
  const body: CreateJournalBody = {
    entryDate: input.entryDate,
    reference: input.reference ?? `INV-W-${Date.now()}`,
    description: input.description ?? 'Investor withdrawal',
    sourceModule: 'investor_module',
    sourceId: `withdrawal:${input.investorEquityAccountId}`,
    createdBy: input.createdBy ?? null,
    projectId: input.projectId,
    investorId: investorMetadataId(input.investorPartyId, input.investorEquityAccountId),
    investorTransactionType: 'withdrawal',
    lines: [
      {
        accountId: input.investorEquityAccountId,
        debitAmount: amt,
        creditAmount: 0,
        projectId: input.projectId,
      },
      { accountId: input.cashAccountId, debitAmount: 0, creditAmount: amt, projectId: input.projectId },
    ],
  };
  const { journalEntryId } = await postInvestorJournalEntry(client, tenantId, body);
  await mirrorWithdrawalToTransactionsRow(client, tenantId, {
    journalEntryId,
    entryDate: input.entryDate,
    amount: amt,
    cashAccountId: input.cashAccountId,
    investorEquityAccountId: input.investorEquityAccountId,
    projectId: input.projectId,
    description: input.description,
    reference: input.reference ?? body.reference,
    createdBy: input.createdBy ?? null,
  });
  return { journalEntryId };
}

/** Non-cash: Dr Retained earnings / Cr Investor equity */
export async function postProfitAllocationToInvestor(
  client: pg.PoolClient,
  tenantId: string,
  input: {
    entryDate: string;
    amount: number;
    retainedEarningsAccountId: string;
    investorEquityAccountId: string;
    projectId: string;
    investorPartyId?: string | null;
    description?: string;
    reference?: string;
    createdBy?: string | null;
  }
): Promise<{ journalEntryId: string }> {
  const amt = roundMoney(input.amount);
  if (amt <= 0) throw new Error('Amount must be positive.');
  const body: CreateJournalBody = {
    entryDate: input.entryDate,
    reference: input.reference ?? `INV-P-${Date.now()}`,
    description: input.description ?? 'Profit allocation to investor',
    sourceModule: 'investor_module',
    sourceId: `profit_allocation:${input.investorEquityAccountId}`,
    createdBy: input.createdBy ?? null,
    projectId: input.projectId,
    investorId: investorMetadataId(input.investorPartyId, input.investorEquityAccountId),
    investorTransactionType: 'profit_allocation',
    lines: [
      {
        accountId: input.retainedEarningsAccountId,
        debitAmount: amt,
        creditAmount: 0,
        projectId: input.projectId,
      },
      {
        accountId: input.investorEquityAccountId,
        debitAmount: 0,
        creditAmount: amt,
        projectId: input.projectId,
      },
    ],
  };
  return postInvestorJournalEntry(client, tenantId, body);
}

/** Inter-project: clearing-style two entries (no cash) or user supplies cash legs — here book-only via clearing not used; two entries Dr/Cr equity with cash if needed. */
export async function postInterProjectEquityTransfer(
  client: pg.PoolClient,
  tenantId: string,
  input: {
    entryDate: string;
    amount: number;
    investorEquityAccountId: string;
    investorPartyId?: string | null;
    /** Cash out from source project (Dr equity source / Cr cash) */
    sourceProjectId: string;
    cashAccountId: string;
    /** Cash in to destination (Dr cash / Cr equity) */
    destProjectId: string;
    description?: string;
    createdBy?: string | null;
  }
): Promise<{ outJournalEntryId: string; inJournalEntryId: string }> {
  const amt = roundMoney(input.amount);
  if (amt <= 0) throw new Error('Amount must be positive.');
  const baseDesc = input.description ?? 'Inter-project equity transfer';

  const outJe = await postInvestorJournalEntry(client, tenantId, {
    entryDate: input.entryDate,
    reference: `INV-T-OUT-${Date.now()}`,
    description: `${baseDesc} (source project)`,
    sourceModule: 'investor_module',
    sourceId: `transfer_out:${input.investorEquityAccountId}`,
    createdBy: input.createdBy ?? null,
    projectId: input.sourceProjectId,
    investorId: investorMetadataId(input.investorPartyId, input.investorEquityAccountId),
    investorTransactionType: 'transfer',
    lines: [
      {
        accountId: input.investorEquityAccountId,
        debitAmount: amt,
        creditAmount: 0,
        projectId: input.sourceProjectId,
      },
      { accountId: input.cashAccountId, debitAmount: 0, creditAmount: amt, projectId: input.sourceProjectId },
    ],
  });

  const inJe = await postInvestorJournalEntry(client, tenantId, {
    entryDate: input.entryDate,
    reference: `INV-T-IN-${Date.now()}`,
    description: `${baseDesc} (destination project)`,
    sourceModule: 'investor_module',
    sourceId: `transfer_in:${input.investorEquityAccountId}`,
    createdBy: input.createdBy ?? null,
    projectId: input.destProjectId,
    investorId: investorMetadataId(input.investorPartyId, input.investorEquityAccountId),
    investorTransactionType: 'transfer',
    lines: [
      { accountId: input.cashAccountId, debitAmount: amt, creditAmount: 0, projectId: input.destProjectId },
      {
        accountId: input.investorEquityAccountId,
        debitAmount: 0,
        creditAmount: amt,
        projectId: input.destProjectId,
      },
    ],
  });

  return { outJournalEntryId: outJe.journalEntryId, inJournalEntryId: inJe.journalEntryId };
}

export type InvestorLedgerRow = {
  journalEntryId: string;
  entryDate: string;
  investorTransactionType: string | null;
  reference: string | null;
  description: string | null;
  accountId: string;
  accountName: string;
  debit: number;
  credit: number;
  projectId: string | null;
};

/** Lines hitting the investor equity account (running balance computed client-side). */
export async function fetchInvestorEquityLedger(
  client: pg.PoolClient,
  tenantId: string,
  investorEquityAccountId: string,
  options: { from?: string; to?: string; projectId?: string | 'all' }
): Promise<InvestorLedgerRow[]> {
  const rows = await new JournalRepository(tenantId).listInvestorEquityLedgerLines(
    client,
    investorEquityAccountId,
    options
  );
  return rows.map((row) => ({
    journalEntryId: row.journal_entry_id,
    entryDate: String(row.entry_date).slice(0, 10),
    investorTransactionType: row.investor_transaction_type,
    reference: row.reference,
    description: row.description,
    accountId: row.account_id,
    accountName: row.account_name,
    debit: roundMoney(row.debit),
    credit: roundMoney(row.credit),
    projectId: row.project_id != null ? String(row.project_id) : null,
  }));
}
