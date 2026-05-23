/**
 * Regression checks for equity withdrawal edits.
 * Run: npx tsx tests/withdrawalEditValidation.test.ts
 */
import assert from 'node:assert';
import type { AppState } from '../types';
import { AccountType, EquityLedgerSubtype, TransactionType } from '../types';
import { validateWithdrawal, validateWithdrawalEdit } from '../modules/investor-fund-availability/utils/validateWithdrawal';

function baseState(overrides: Partial<AppState> = {}): AppState {
  const state: AppState = {
    users: [],
    currentUser: null,
    accounts: [
      { id: 'bank', name: 'Main Bank', type: AccountType.BANK, balance: 0 },
      { id: 'investor', name: 'Investor Equity', type: AccountType.EQUITY, balance: 0 },
      { id: 'clearing', name: 'Internal Clearing', type: AccountType.BANK, balance: 0 },
    ],
    contacts: [],
    vendors: [],
    categories: [],
    projects: [
      { id: 'project', name: 'Project A', description: '', color: '#000', status: 'Active' },
      { id: 'other-project', name: 'Project B', description: '', color: '#000', status: 'Active' },
    ],
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
    currentPage: 'dashboard',
    editingEntity: null,
    initialTransactionType: null,
    initialTransactionFilter: null,
    initialTabs: [],
    ...overrides,
  };
  return state;
}

const noReserve = { mode: 'percent', percent: 0 } as const;

{
  const state = baseState({
    transactions: [
      {
        id: 'investment',
        type: TransactionType.TRANSFER,
        subtype: EquityLedgerSubtype.INVESTMENT,
        amount: 10000,
        date: '2024-01-01',
        accountId: 'investor',
        fromAccountId: 'investor',
        toAccountId: 'bank',
        projectId: 'project',
      },
      {
        id: 'withdrawal',
        type: TransactionType.TRANSFER,
        subtype: EquityLedgerSubtype.WITHDRAWAL,
        amount: 8000,
        date: '2024-01-15',
        accountId: 'bank',
        fromAccountId: 'bank',
        toAccountId: 'investor',
        projectId: 'project',
      },
    ],
  });

  const fullReplacementCheck = validateWithdrawal(state, 'project', 6000, '2024-01-31', noReserve);
  assert.equal(fullReplacementCheck.ok, false, 'existing full-amount check reproduces the false block');

  const decrease = validateWithdrawalEdit(state, 'project', 8000, 6000, '2024-01-31', noReserve);
  assert.equal(decrease.ok, true, 'decreasing an existing withdrawal should not be blocked');

  const affordableIncrease = validateWithdrawalEdit(state, 'project', 8000, 9000, '2024-01-31', noReserve);
  assert.equal(affordableIncrease.ok, true, 'only the incremental increase should be checked');
  assert.equal(affordableIncrease.requestedAmount, 1000, 'validation amount is the extra outflow');

  const unaffordableIncrease = validateWithdrawalEdit(state, 'project', 8000, 11000, '2024-01-31', noReserve);
  assert.equal(unaffordableIncrease.ok, false, 'incremental increases still cannot exceed available cash');

  const movedToUnfundedProject = validateWithdrawalEdit(state, 'other-project', 8000, 6000, '2024-01-31', noReserve, {
    currentBalanceIncludesOriginal: false,
  });
  assert.equal(movedToUnfundedProject.ok, false, 'moving a withdrawal to another project must validate the full amount');

  const movedBeforeProjectFunding = validateWithdrawalEdit(state, 'project', 8000, 6000, '2023-12-31', noReserve, {
    currentBalanceIncludesOriginal: false,
  });
  assert.equal(movedBeforeProjectFunding.ok, false, 'moving a withdrawal before the original cash impact must validate the full amount');
}

console.log('withdrawalEditValidation: ok');
