/**
 * Cash flow engine (IAS 7 direct method) — classification and reconciliation smoke tests.
 */
import assert from 'node:assert';
import { computeCashFlowReport, getTransactionCashDelta } from '../components/reports/cashFlowEngine';
import type { AppState } from '../types';
import {
  AccountType,
  EquityLedgerSubtype,
  LoanSubtype,
  TransactionType,
} from '../types';

function minimalState(overrides: Partial<AppState> = {}): AppState {
  const base: AppState = {
    users: [],
    currentUser: null,
    accounts: [
      { id: 'bank1', name: 'Main Bank', type: AccountType.BANK, balance: 0 },
      { id: 'eq1', name: 'Owner Equity', type: AccountType.EQUITY, balance: 0 },
      { id: 'fxa1', name: 'Fixed Assets', type: AccountType.ASSET, balance: 0 },
      { id: 'sys-acc-clearing', name: 'Internal Clearing', type: AccountType.BANK, balance: 0 },
    ],
    contacts: [],
    vendors: [],
    categories: [
      {
        id: 'cat_opex',
        name: 'General Expense',
        type: TransactionType.EXPENSE,
        plSubType: 'operating_expense',
      },
    ],
    projects: [{ id: 'p1', name: 'P1' }],
    buildings: [],
    properties: [],
    propertyOwnershipHistory: [],
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
        id: 'inv1',
        type: TransactionType.TRANSFER,
        amount: 5000,
        date: '2024-06-10',
        accountId: 'eq1',
        fromAccountId: 'eq1',
        toAccountId: 'bank1',
        subtype: EquityLedgerSubtype.INVESTMENT,
        projectId: 'p1',
      } as AppState['transactions'][0],
      {
        id: 'capex1',
        type: TransactionType.TRANSFER,
        amount: 2000,
        date: '2024-06-11',
        accountId: 'bank1',
        fromAccountId: 'bank1',
        toAccountId: 'fxa1',
        projectId: 'p1',
      } as AppState['transactions'][0],
      {
        id: 'exp1',
        type: TransactionType.EXPENSE,
        amount: 100,
        date: '2024-06-12',
        accountId: 'bank1',
        categoryId: 'cat_opex',
        projectId: 'p1',
      } as AppState['transactions'][0],
      {
        id: 'loanrepay',
        type: TransactionType.LOAN,
        subtype: LoanSubtype.REPAY,
        amount: 300,
        date: '2024-06-13',
        accountId: 'bank1',
        projectId: 'p1',
      } as AppState['transactions'][0],
    ],
  });

  const r = computeCashFlowReport(state, {
    fromDate: '2024-06-01',
    toDate: '2024-06-30',
    selectedProjectId: 'p1',
  });

  assert.ok(
    r.financing.items.some((i) => i.label.includes('contributions') && i.amount > 0),
    'owner investment → financing inflow'
  );
  assert.ok(
    r.investing.items.some((i) => i.label.toLowerCase().includes('purchase') && i.amount < 0),
    'asset purchase → investing outflow'
  );
  assert.ok(
    r.operating.items.some((i) => i.label.includes('operating expenses') && i.amount < 0),
    'daily expense → operating'
  );
  assert.ok(
    r.financing.items.some((i) => i.label.includes('Repayment') && i.amount < 0),
    'loan repayment → financing'
  );
  assert.ok(r.validation.reconciled, `expected reconciled, discrepancy=${r.validation.discrepancy}`);
}

{
  const state = minimalState();
  const tx = {
    id: 't',
    type: TransactionType.TRANSFER,
    amount: 100,
    date: '2024-01-01',
    accountId: 'bank1',
    fromAccountId: 'bank1',
    toAccountId: 'sys-acc-clearing',
  } as AppState['transactions'][0];
  const m = new Map(state.accounts.map((a) => [a.id, a]));
  assert.strictEqual(getTransactionCashDelta(tx, m), 0, 'internal bank transfer → 0 delta');
}

console.log('cashFlowEngine.test.ts: OK');
