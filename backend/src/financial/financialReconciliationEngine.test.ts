import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  findMissingJournalMirrors,
  getFinancialReportSourceRegistry,
  runFinancialReconciliationCertification,
  type FinancialReportSourceAudit,
  type ReconciliationCheck,
} from './financialReconciliationEngine.js';
import {
  buildTrialBalanceFromJournal,
  type JournalEntryRow,
  type JournalLineRow,
  type LedgerAccount,
} from './journalLedgerCore.js';

function account(id: string, name: string, type: string, ob = 0): LedgerAccount {
  return { id, name, type, openingBalance: ob, isActive: true };
}

function entry(id: string, date: string, sourceId: string | null): JournalEntryRow {
  return { id, entryDate: date, sourceModule: 'transaction', sourceId, isReversed: false };
}

function line(jeId: string, accId: string, d: number, c: number): JournalLineRow {
  return { journalEntryId: jeId, accountId: accId, debitAmount: d, creditAmount: c, lineNumber: 0 };
}

describe('financialReconciliationEngine', () => {
  it('lists core report sources with unified TB and GL', () => {
    const sources = getFinancialReportSourceRegistry();
    const tb = sources.find((s: FinancialReportSourceAudit) => s.reportId === 'trial_balance');
    assert.equal(tb?.status, 'unified');
    assert.equal(tb?.primarySource, 'journal');
    const pl = sources.find((s: FinancialReportSourceAudit) => s.reportId === 'profit_loss');
    assert.equal(pl?.status, 'partial');
  });

  it('finds transactions missing journal mirrors', () => {
    const transactions = [
      { id: 'tx1', type: 'Income', amount: 100, date: '2024-06-01' },
      { id: 'tx2', type: 'Expense', amount: 50, date: '2024-06-02' },
    ];
    const journalEntries = [entry('je1', '2024-06-01', 'tx1')];
    const missing = findMissingJournalMirrors(transactions, journalEntries);
    assert.equal(missing.length, 1);
    assert.equal(missing[0]!.transactionId, 'tx2');
  });

  it('certifies reconciled balanced journal set', () => {
    const catId = 'cat-rev';
    const accounts = [
      account('cash', 'Cash', 'Cash'),
      account('clear', 'Clearing', 'Bank'),
      account('eq', 'Capital', 'Equity', 0),
    ];
    const transactions = [
      {
        id: 'tx1',
        type: 'Income',
        amount: 1000,
        date: '2024-05-10',
        categoryId: catId,
        accountId: 'cash',
      },
    ];
    const journalEntries = [entry('je1', '2024-05-10', 'tx1')];
    const journalLines = [
      line('je1', 'cash', 1000, 0),
      line('je1', 'clear', 0, 1000),
    ];

    const certification = runFinancialReconciliationCertification({
      journalLedger: { journalLines, journalEntries, accounts, transactions },
      period: { from: '2024-05-01', to: '2024-05-31' },
      netProfit: 1000,
    });

    assert.equal(certification.checks.find((c: ReconciliationCheck) => c.id === 'tb_debits_equal_credits')?.passed, true);
    assert.equal(certification.missingJournalCount, 0);
    assert.ok(certification.score >= 70);
  });

  it('flags missing journals in certification', () => {
    const accounts = [account('cash', 'Cash', 'Cash'), account('clear', 'Clearing', 'Bank')];
    const transactions = [{ id: 'tx-unposted', type: 'Income', amount: 500, date: '2024-06-01' }];
    const certification = runFinancialReconciliationCertification({
      journalLedger: { journalLines: [], journalEntries: [], accounts, transactions },
      period: { from: '2024-06-01', to: '2024-06-30' },
      netProfit: 0,
    });

    assert.equal(certification.missingJournalCount, 1);
    assert.equal(
      certification.checks.find((c: ReconciliationCheck) => c.id === 'no_missing_journal_mirrors')?.passed,
      false
    );
    assert.notEqual(certification.overallStatus, 'reconciled');
  });
});

describe('buildTrialBalanceFromJournal integration', () => {
  it('produces balanced trial balance for double-entry set', () => {
    const accounts = [account('a', 'Cash', 'Cash'), account('b', 'Clear', 'Bank')];
    const journalEntries = [entry('je1', '2024-01-15', 'tx1')];
    const journalLines = [line('je1', 'a', 200, 0), line('je1', 'b', 0, 200)];
    const tb = buildTrialBalanceFromJournal(
      { journalLines, journalEntries, accounts },
      { from: '2024-01-01', to: '2024-01-31', basis: 'period' }
    );
    assert.equal(tb.isBalanced, true);
  });
});
