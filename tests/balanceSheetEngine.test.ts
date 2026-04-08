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

console.log('balanceSheetEngine.test.ts: OK');
