/**
 * Journal cash flow engine — classification and reconciliation.
 */
import assert from 'node:assert/strict';
import {
  buildCashFlowReportFromJournal,
  cashLineNetEffect,
  type CashFlowJournalLineInput,
  type CashFlowSiblingLineInput,
} from '../shared/financial-core/cashFlowJournalCore.ts';

{
  assert.equal(cashLineNetEffect(100, 0), 100);
  assert.equal(cashLineNetEffect(0, 40), -40);
}

{
  const entryId = 'je-1';
  const cashLines: CashFlowJournalLineInput[] = [
    {
      id: 'jl-cash',
      journalEntryId: entryId,
      accountId: 'acc-bank',
      debit: 0,
      credit: 500,
      entryDate: '2025-06-01',
      accountName: 'Main Bank',
      accountType: 'Bank',
    },
  ];
  const siblings: CashFlowSiblingLineInput[] = [
    {
      id: 'jl-exp',
      journalEntryId: entryId,
      accountId: 'acc-exp',
      debit: 500,
      credit: 0,
      accountName: 'Office Expense',
      accountType: 'Expense',
    },
    {
      id: 'jl-cash',
      journalEntryId: entryId,
      accountId: 'acc-bank',
      debit: 0,
      credit: 500,
      accountName: 'Main Bank',
      accountType: 'Bank',
    },
  ];
  const siblingsByEntry = new Map([[entryId, siblings]]);
  const report = buildCashFlowReportFromJournal({
    from: '2025-06-01',
    to: '2025-06-30',
    cashLines,
    siblingsByEntry,
    openingCash: 1000,
    closingCash: 500,
  });
  assert.equal(report.operating.total, -500);
  assert.equal(report.summary.net_change, -500);
  assert.equal(report.validation.reconciled, true);
  assert.equal(report.flags.source, 'journal');
}

{
  const entryId = 'je-loan';
  const cashLines: CashFlowJournalLineInput[] = [
    {
      id: 'jl-in',
      journalEntryId: entryId,
      accountId: 'acc-bank',
      debit: 10000,
      credit: 0,
      entryDate: '2025-07-01',
      accountName: 'Main Bank',
      accountType: 'Bank',
    },
  ];
  const siblings: CashFlowSiblingLineInput[] = [
    {
      id: 'jl-liab',
      journalEntryId: entryId,
      accountId: 'acc-loan',
      debit: 0,
      credit: 10000,
      accountName: 'Term Loan',
      accountType: 'Liability',
    },
    {
      id: 'jl-in',
      journalEntryId: entryId,
      accountId: 'acc-bank',
      debit: 10000,
      credit: 0,
      accountName: 'Main Bank',
      accountType: 'Bank',
    },
  ];
  const report = buildCashFlowReportFromJournal({
    from: '2025-07-01',
    to: '2025-07-31',
    cashLines,
    siblingsByEntry: new Map([[entryId, siblings]]),
    openingCash: 0,
    closingCash: 10000,
  });
  assert.equal(report.financing.total, 10000);
  assert.equal(report.validation.reconciled, true);
}

console.log('cashFlowJournalCore.test.ts: OK');
