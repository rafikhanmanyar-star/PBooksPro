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
    propertyOwnershipHistory: [],
    propertyOwnership: [],
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

console.log('balanceSheetEngine.test.ts: OK');
