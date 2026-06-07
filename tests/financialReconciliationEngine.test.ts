/**
 * Client-side financial reconciliation engine tests (mirrors backend suite).
 */
import assert from 'node:assert';
import {
  findMissingJournalMirrors,
  getFinancialReportSourceRegistry,
  runFinancialReconciliationCertification,
} from '../services/financialEngine/financialReconciliationEngine';
import { buildTrialBalanceFromJournal } from '../services/financialEngine/journalLedgerCore';
import { AccountType } from '../types';

function account(id: string, name: string, type: string, ob = 0) {
  return { id, name, type, openingBalance: ob, isActive: true };
}

function entry(id: string, date: string, sourceId: string | null) {
  return { id, entryDate: date, sourceModule: 'transaction', sourceId, isReversed: false };
}

function line(jeId: string, accId: string, d: number, c: number) {
  return { journalEntryId: jeId, accountId: accId, debitAmount: d, creditAmount: c, lineNumber: 0 };
}

{
  const sources = getFinancialReportSourceRegistry();
  assert.ok(sources.some((s) => s.reportId === 'general_ledger' && s.status === 'unified'));
}

{
  const missing = findMissingJournalMirrors(
    [{ id: 'tx1', type: 'Income', amount: 100, date: '2024-06-01' }],
    []
  );
  assert.equal(missing.length, 1);
}

{
  const accounts = [account('cash', 'Cash', AccountType.CASH), account('clear', 'Clearing', AccountType.BANK)];
  const certification = runFinancialReconciliationCertification({
    journalLedger: {
      journalLines: [line('je1', 'cash', 500, 0), line('je1', 'clear', 0, 500)],
      journalEntries: [entry('je1', '2024-06-01', 'tx1')],
      accounts,
      transactions: [{ id: 'tx1', type: 'Income', amount: 500, date: '2024-06-01' }],
    },
    period: { from: '2024-06-01', to: '2024-06-30' },
    netProfit: 500,
  });
  assert.equal(certification.missingJournalCount, 0);
  assert.equal(certification.checks.find((c) => c.id === 'tb_debits_equal_credits')?.passed, true);
}

{
  const tb = buildTrialBalanceFromJournal(
    {
      journalLines: [line('je1', 'a', 100, 0), line('je1', 'b', 0, 100)],
      journalEntries: [entry('je1', '2024-01-01', null)],
      accounts: [account('a', 'A', 'Cash'), account('b', 'B', 'Bank')],
    },
    { from: '2024-01-01', to: '2024-01-31', basis: 'period' }
  );
  assert.equal(tb.isBalanced, true);
}

console.log('financialReconciliationEngine.test.ts: ok');
