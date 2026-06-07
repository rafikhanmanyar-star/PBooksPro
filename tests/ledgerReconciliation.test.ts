/**
 * Ledger reconciliation: TB, BS, P&L from unified journal_lines.
 */
import assert from 'node:assert';
import {
  buildTrialBalanceFromJournal,
  computeAccountBalancesFromJournal,
  mirroredTransactionIds,
  reconcileFinancialStatements,
  type JournalEntryRow,
  type JournalLedgerInput,
  type JournalLineRow,
  type LedgerAccount,
} from '../services/financialEngine/journalLedgerCore';
import { computeProfitLossReport } from '../components/reports/profitLossEngine';
import { computeBalanceSheetReport } from '../components/reports/balanceSheetEngine';
import { TransactionType, AccountType } from '../types';
import type { AppState, Transaction } from '../types';

function account(id: string, name: string, type: string, ob = 0): LedgerAccount {
  return { id, name, type, openingBalance: ob, isActive: true };
}

function entry(
  id: string,
  date: string,
  sourceId: string | null,
  mod = 'transaction'
): JournalEntryRow {
  return {
    id,
    entryDate: date,
    sourceModule: mod,
    sourceId,
    reference: `JE-${id}`,
    isReversed: false,
  };
}

function line(jeId: string, accId: string, d: number, c: number): JournalLineRow {
  return {
    journalEntryId: jeId,
    accountId: accId,
    debitAmount: d,
    creditAmount: c,
    lineNumber: 0,
  };
}

// --- balanced journal → TB balances ---
{
  const accounts = [
    account('cash', 'Cash', 'Cash'),
    account('clear', 'Internal Clearing', 'Bank'),
  ];
  const journalEntries = [entry('je1', '2024-06-01', 'tx1')];
  const journalLines = [
    line('je1', 'cash', 1000, 0),
    line('je1', 'clear', 0, 1000),
  ];
  const input: JournalLedgerInput = { journalLines, journalEntries, accounts };
  const tb = buildTrialBalanceFromJournal(input, {
    from: '2024-01-01',
    to: '2024-12-31',
    basis: 'period',
  });
  assert.strictEqual(tb.isBalanced, true);
  assert.strictEqual(tb.totals.totalDebit, tb.totals.totalCredit);
}

// --- opening balance + activity ---
{
  const accounts = [
    account('bank', 'Main Bank', 'Bank', 5000),
    account('clear', 'Clearing', 'Bank'),
  ];
  const journalEntries = [entry('je1', '2024-06-15', 'tx1')];
  const journalLines = [
    line('je1', 'bank', 200, 0),
    line('je1', 'clear', 0, 200),
  ];
  const input: JournalLedgerInput = { journalLines, journalEntries, accounts };
  const tb = buildTrialBalanceFromJournal(input, {
    from: '2024-06-01',
    to: '2024-06-30',
    basis: 'period',
  });
  assert.strictEqual(tb.isBalanced, true);
  const bank = tb.accounts.find((a) => a.accountId === 'bank');
  assert.ok(bank && bank.debit > 5000);
}

// --- reversal nets to zero in same period ---
{
  const accounts = [account('cash', 'Cash', 'Cash'), account('clear', 'Clearing', 'Bank')];
  const journalEntries = [
    entry('je1', '2024-03-01', 'tx1'),
    { ...entry('je2', '2024-03-02', 'tx1', 'reversal'), isReversed: false },
  ];
  journalEntries[0].isReversed = true;
  const journalLines = [
    line('je1', 'cash', 500, 0),
    line('je1', 'clear', 0, 500),
    line('je2', 'cash', 0, 500),
    line('je2', 'clear', 500, 0),
  ];
  const input: JournalLedgerInput = { journalLines, journalEntries, accounts };
  const tb = buildTrialBalanceFromJournal(input, {
    from: '2024-03-01',
    to: '2024-03-31',
    basis: 'period',
  });
  assert.strictEqual(tb.isBalanced, true);
}

// --- date filtering: period vs cumulative ---
{
  const accounts = [account('cash', 'Cash', 'Cash'), account('clear', 'Clearing', 'Bank')];
  const journalEntries = [
    entry('je1', '2024-01-15', 'tx1'),
    entry('je2', '2024-02-15', 'tx2'),
  ];
  const journalLines = [
    line('je1', 'cash', 100, 0),
    line('je1', 'clear', 0, 100),
    line('je2', 'cash', 50, 0),
    line('je2', 'clear', 0, 50),
  ];
  const input: JournalLedgerInput = { journalLines, journalEntries, accounts };
  const period = buildTrialBalanceFromJournal(input, {
    from: '2024-02-01',
    to: '2024-02-28',
    basis: 'period',
  });
  const cumulative = buildTrialBalanceFromJournal(input, {
    from: '2024-01-01',
    to: '2024-02-28',
    basis: 'cumulative',
  });
  const cashPeriod = period.accounts.find((a) => a.accountId === 'cash');
  const cashCum = cumulative.accounts.find((a) => a.accountId === 'cash');
  /** Period basis includes prior-period activity (B/F) + in-range activity */
  assert.strictEqual(cashPeriod?.debit, 150);
  assert.strictEqual(cashCum?.debit, 150);
}

// --- full reconciliation: TB ↔ BS ↔ P&L ---
{
  const catId = 'cat-rev';
  const accounts = [
    account('cash', 'Operating Cash', AccountType.CASH),
    account('clear', 'Internal Clearing', AccountType.BANK),
    account('eq', 'Owner Capital', AccountType.EQUITY),
  ];
  const transactions: Transaction[] = [
    {
      id: 'tx1',
      type: TransactionType.INCOME,
      amount: 1000,
      date: '2024-05-10',
      categoryId: catId,
      accountId: 'cash',
      projectId: 'proj-1',
      description: 'Sale',
    } as Transaction,
  ];
  const journalEntries = [entry('je1', '2024-05-10', 'tx1')];
  const journalLines = [
    line('je1', 'cash', 1000, 0),
    line('je1', 'clear', 0, 1000),
  ];
  const journalLedger: JournalLedgerInput = {
    journalLines,
    journalEntries,
    accounts,
    transactions,
  };

  const state = {
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type as AccountType,
      balance: 0,
      openingBalance: a.openingBalance ?? 0,
      isPermanent: false,
    })),
    transactions,
    categories: [
      {
        id: catId,
        name: 'Sales',
        type: TransactionType.INCOME,
        plSubType: 'revenue' as const,
        isRental: false,
      },
    ],
    invoices: [],
    bills: [],
    projectAgreements: [],
    projectReceivedAssets: [],
    units: [],
    projects: [{ id: 'proj-1', name: 'P1' }],
    journalLedger,
  } as AppState & { journalLedger: JournalLedgerInput };

  const pl = computeProfitLossReport(state, {
    startDate: '2024-05-01',
    endDate: '2024-05-31',
    selectedProjectId: 'proj-1',
  });
  assert.ok(pl.net_profit > 0, 'P&L should reflect journal-mirrored income');

  const bs = computeBalanceSheetReport(state, {
    asOfDate: '2024-05-31',
    selectedProjectId: 'all',
    useJournalLedger: true,
  });
  assert.strictEqual(bs.isBalanced, true, `BS should balance: diff=${bs.totals.difference}`);

  const tb = buildTrialBalanceFromJournal(journalLedger, {
    from: '2024-05-01',
    to: '2024-05-31',
    basis: 'period',
  });
  const balances = computeAccountBalancesFromJournal(journalLedger, '2024-05-31');
  const recon = reconcileFinancialStatements(tb, balances, accounts, pl.net_profit);
  assert.strictEqual(recon.isBalanced, true, recon.issues.join('; '));
  assert.strictEqual(recon.assetsEqualLiabilitiesPlusEquity, true);
  assert.strictEqual(recon.trialBalance.isBalanced, true);
}

console.log('ledgerReconciliation.test.ts: ok');
