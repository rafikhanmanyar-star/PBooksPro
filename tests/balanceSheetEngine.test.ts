/**
 * Balance sheet engine smoke tests (tsx / node).
 */
import assert from 'node:assert';
import { computeBalanceSheetReport } from '../components/reports/balanceSheetEngine';
import type { AppState } from '../types';
import { AccountType, TransactionType } from '../types';

function minimalState(overrides: Partial<AppState> = {}): AppState {
  const base: AppState = {
    users: [],
    currentUser: null,
    accounts: [
      { id: 'cash1', name: 'Cash', type: AccountType.CASH, balance: 0 },
      { id: 'sys-acc-clearing', name: 'Internal Clearing', type: AccountType.BANK, balance: 0 },
    ],
    contacts: [],
    vendors: [],
    categories: [],
    projects: [{ id: 'p1', name: 'P1' }],
    buildings: [],
    properties: [],
    units: [],
    transactions: [],
    invoices: [],
    bills: [],
    quotations: [],
    documents: [],
    budgets: [],
    rentalAgreements: [],
    projectAgreements: [],
    salesReturns: [],
    projectReceivedAssets: [],
    contracts: [],
    personalCategories: [],
    personalTransactions: [],
    recurringInvoiceTemplates: [],
    pmCycleAllocations: [],
    agreementSettings: {} as AppState['agreementSettings'],
    projectAgreementSettings: {} as AppState['projectAgreementSettings'],
    rentalInvoiceSettings: {} as AppState['rentalInvoiceSettings'],
    projectInvoiceSettings: {} as AppState['projectInvoiceSettings'],
    printSettings: {} as AppState['printSettings'],
    whatsAppTemplates: {} as AppState['whatsAppTemplates'],
    dashboardConfig: { visibleKpis: [] },
    accountConsistency: { actualByAccountId: {} },
    installmentPlans: [],
    planAmenities: [],
    showSystemTransactions: false,
    enableColorCoding: false,
    enableBeepOnSave: false,
    enableDatePreservation: false,
    whatsAppMode: 'manual',
    pmCostPercentage: 0,
  };
  return { ...base, ...overrides };
}

{
  const state = minimalState({
    transactions: [
      {
        id: 't1',
        type: TransactionType.TRANSFER,
        amount: 1000,
        date: '2024-01-15',
        description: 'Fund cash',
        accountId: 'cash1',
        fromAccountId: 'sys-acc-clearing',
        toAccountId: 'cash1',
      } as AppState['transactions'][0],
    ],
  });
  const r = computeBalanceSheetReport(state, { asOfDate: '2024-12-31', selectedProjectId: 'all' });
  assert.ok(Math.abs(r.totals.difference) < 1, `expected balanced, got diff ${r.totals.difference}`);
}

{
  const state = minimalState();
  const r = computeBalanceSheetReport(state, { asOfDate: '2024-12-31', selectedProjectId: 'all' });
  assert.ok(r.isBalanced);
}

/** P&L excludes Internal Clearing legs; statement still balances by closing RE as residual. */
{
  const state = minimalState({
    categories: [{ id: 'cat-opex', name: 'Operating expense', type: TransactionType.EXPENSE }],
    transactions: [
      {
        id: 'clearing-exp',
        type: TransactionType.EXPENSE,
        amount: 100,
        date: '2024-06-01',
        description: 'Expense via clearing (excluded from P&L)',
        accountId: 'sys-acc-clearing',
        projectId: 'p1',
        categoryId: 'cat-opex',
      } as AppState['transactions'][0],
    ],
  });
  const r = computeBalanceSheetReport(state, { asOfDate: '2024-12-31', selectedProjectId: 'all' });
  assert.ok(r.isBalanced, `expected balanced, got diff ${r.totals.difference}`);
  assert.ok(Math.abs(r.retainedEarningsFromPL) < 0.01, 'P&L should exclude clearing expense');
  const reLine = r.equity.items.find((l) => l.id === 'computed-retained-earnings');
  assert.ok(reLine && Math.abs(reLine.amount + 100) < 0.01, `expected RE ≈ -100, got ${reLine?.amount}`);
  assert.ok(r.validation.some((v) => v.code === 'RE_DIFFERS_FROM_PL'), 'expected RE vs P&L warning');
}

/** Journal mode: bank opening_balance is offset by Opening Balance Equity (matches trial balance). */
{
  const journalEntries = [
    {
      id: 'je1',
      entryDate: '2024-06-01',
      sourceModule: 'transaction',
      sourceId: 'tx1',
      isReversed: false,
    },
  ];
  const journalLines = [
    {
      journalEntryId: 'je1',
      accountId: 'sys-acc-cash',
      debitAmount: 500000,
      creditAmount: 0,
      lineNumber: 1,
    },
    {
      journalEntryId: 'je1',
      accountId: 'sys-acc-income-summary',
      debitAmount: 0,
      creditAmount: 500000,
      lineNumber: 2,
    },
  ];
  const state = minimalState({
    accounts: [
      { id: 'sys-acc-cash', name: 'Cash', type: AccountType.CASH, balance: 0, openingBalance: 0 },
      {
        id: 'demo-acc-operating',
        name: 'Main Operating Account',
        type: AccountType.BANK,
        balance: 0,
        openingBalance: 3300000,
      },
      {
        id: 'sys-acc-income-summary',
        name: 'Income Summary',
        type: AccountType.EQUITY,
        balance: 0,
      },
      {
        id: 'sys-acc-expense-summary',
        name: 'Expense Summary',
        type: AccountType.EQUITY,
        balance: 0,
      },
      { id: 'sys-acc-ar', name: 'Accounts Receivable', type: AccountType.ASSET, balance: 0 },
      { id: 'sys-acc-ap', name: 'Accounts Payable', type: AccountType.LIABILITY, balance: 0 },
    ],
    journalLedger: {
      journalEntries,
      journalLines,
      accounts: [
        { id: 'sys-acc-cash', name: 'Cash', type: 'Cash', openingBalance: 0 },
        { id: 'demo-acc-operating', name: 'Main Operating Account', type: 'Bank', openingBalance: 3300000 },
        { id: 'sys-acc-income-summary', name: 'Income Summary', type: 'Equity' },
        { id: 'sys-acc-expense-summary', name: 'Expense Summary', type: 'Equity' },
        { id: 'sys-acc-ar', name: 'Accounts Receivable', type: 'Asset' },
        { id: 'sys-acc-ap', name: 'Accounts Payable', type: 'Liability' },
      ],
    },
  });
  const r = computeBalanceSheetReport(state, {
    asOfDate: '2024-12-31',
    selectedProjectId: 'all',
    useJournalLedger: true,
  });
  assert.ok(r.isBalanced, `journal BS with opening balance should balance, diff=${r.totals.difference}`);
  assert.ok(
    r.equity.items.some((l) => l.id === '__opening_balance_equity__' && l.amount === 3300000),
    'expected Opening Balance Equity line'
  );
}

/** Project scope: tenant opening balances and Opening Balance Equity are excluded. */
{
  const journalEntries = [
    { id: 'je-p1', entryDate: '2024-06-01', sourceModule: 'transaction', sourceId: 'tx-p1', isReversed: false },
    { id: 'je-p2', entryDate: '2024-06-02', sourceModule: 'transaction', sourceId: 'tx-p2', isReversed: false },
  ];
  const journalLines = [
    {
      journalEntryId: 'je-p1',
      accountId: 'bank1',
      debitAmount: 0,
      creditAmount: 500000,
      lineNumber: 1,
      projectId: 'p1',
    },
    {
      journalEntryId: 'je-p1',
      accountId: 'sys-acc-expense-summary',
      debitAmount: 500000,
      creditAmount: 0,
      lineNumber: 2,
      projectId: 'p1',
    },
    {
      journalEntryId: 'je-p2',
      accountId: 'bank1',
      debitAmount: 0,
      creditAmount: 200000,
      lineNumber: 1,
      projectId: 'p2',
    },
    {
      journalEntryId: 'je-p2',
      accountId: 'sys-acc-expense-summary',
      debitAmount: 200000,
      creditAmount: 0,
      lineNumber: 2,
      projectId: 'p2',
    },
  ];
  const baseAccounts = [
    { id: 'bank1', name: 'Main Bank', type: AccountType.BANK, balance: 0, openingBalance: 1000000 },
    { id: 'sys-acc-expense-summary', name: 'Expense Summary', type: AccountType.EQUITY, balance: 0 },
    { id: 'sys-acc-income-summary', name: 'Income Summary', type: AccountType.EQUITY, balance: 0 },
    { id: 'sys-acc-ar', name: 'AR', type: AccountType.ASSET, balance: 0 },
    { id: 'sys-acc-ap', name: 'AP', type: AccountType.LIABILITY, balance: 0 },
  ];
  const journalLedger = {
    journalEntries,
    journalLines,
    accounts: baseAccounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      openingBalance: a.openingBalance ?? 0,
    })),
  };
  const state = minimalState({
    accounts: baseAccounts,
    projects: [{ id: 'p1', name: 'P1' }, { id: 'p2', name: 'P2' }],
    journalLedger,
  });

  const consolidated = computeBalanceSheetReport(state, {
    asOfDate: '2024-12-31',
    selectedProjectId: 'all',
    useJournalLedger: true,
  });
  const p1 = computeBalanceSheetReport(state, {
    asOfDate: '2024-12-31',
    selectedProjectId: 'p1',
    useJournalLedger: true,
  });
  const p2 = computeBalanceSheetReport(state, {
    asOfDate: '2024-12-31',
    selectedProjectId: 'p2',
    useJournalLedger: true,
  });

  assert.ok(
    Math.abs(consolidated.totals.assets - 300000) < 1,
    `consolidated assets expected ~300k got ${consolidated.totals.assets}`
  );
  assert.ok(Math.abs(p1.totals.assets + 500000) < 1, `p1 assets expected -500k got ${p1.totals.assets}`);
  assert.ok(Math.abs(p2.totals.assets + 200000) < 1, `p2 assets expected -200k got ${p2.totals.assets}`);
  assert.ok(Math.abs(p1.totals.assets - p2.totals.assets) > 1, 'project asset totals should differ');
  assert.ok(
    !p1.equity.items.some((l) => l.id === '__opening_balance_equity__'),
    'no Opening Balance Equity on project-scoped BS'
  );
}

console.log('balanceSheetEngine.test.ts: OK');
