/**
 * Investor withdrawal validation regression tests.
 *
 * Run: npx tsx tests/withdrawalValidation.test.ts
 */
import assert from 'node:assert';
import type { AppState, Transaction } from '../types';
import { AccountType, EquityLedgerSubtype, TransactionType } from '../types';
import {
  validateWithdrawal,
  validateWithdrawalFromAccount,
} from '../modules/investor-fund-availability/utils/validateWithdrawal';

function minimalState(overrides: Partial<AppState> = {}): AppState {
  const base: AppState = {
    users: [],
    currentUser: null,
    accounts: [
      { id: 'bank1', name: 'Main Bank', type: AccountType.BANK, balance: 0 },
      { id: 'bank2', name: 'Secondary Bank', type: AccountType.BANK, balance: 0 },
      { id: 'investor1', name: 'Investor One', type: AccountType.EQUITY, balance: 0 },
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
    transactionLog: [],
    errorLog: [],
    currentPage: 'dashboard',
    editingEntity: null,
    initialTransactionType: null,
    initialTransactionFilter: null,
    initialTabs: [],
    initialImportType: null,
  };
  return { ...base, ...overrides };
}

function tx(p: Partial<Transaction> & Pick<Transaction, 'id' | 'amount' | 'date' | 'type' | 'accountId'>): Transaction {
  return p as Transaction;
}

{
  const state = minimalState({
    transactions: [
      tx({
        id: 'capital-in',
        type: TransactionType.TRANSFER,
        subtype: EquityLedgerSubtype.INVESTMENT,
        amount: 1000,
        date: '2024-01-01',
        accountId: 'investor1',
        fromAccountId: 'investor1',
        toAccountId: 'bank1',
        projectId: 'p1',
      }),
      tx({
        id: 'existing-withdrawal',
        type: TransactionType.TRANSFER,
        subtype: EquityLedgerSubtype.WITHDRAWAL,
        amount: 800,
        date: '2024-01-02',
        accountId: 'bank1',
        fromAccountId: 'bank1',
        toAccountId: 'investor1',
        projectId: 'p1',
      }),
    ],
  });

  const blockedWithoutEditContext = validateWithdrawal(state, 'p1', 900, '2024-01-31', {
    mode: 'percent',
    percent: 0,
  });
  assert.equal(blockedWithoutEditContext.ok, false, 'fresh withdrawals must still be blocked by current cash');

  const editResult = validateWithdrawal(state, 'p1', 900, '2024-01-31', {
    mode: 'percent',
    percent: 0,
  }, { excludeTransactionId: 'existing-withdrawal' });
  assert.equal(editResult.ok, true, 'editing an existing withdrawal should validate against cash with that tx excluded');
  assert.equal(editResult.distributableFunds, 1000);
}

{
  const state = minimalState({
    transactions: [
      tx({
        id: 'capital-bank-1',
        type: TransactionType.TRANSFER,
        subtype: EquityLedgerSubtype.INVESTMENT,
        amount: 200,
        date: '2024-01-01',
        accountId: 'investor1',
        fromAccountId: 'investor1',
        toAccountId: 'bank1',
        projectId: 'p1',
      }),
      tx({
        id: 'capital-bank-2',
        type: TransactionType.TRANSFER,
        subtype: EquityLedgerSubtype.INVESTMENT,
        amount: 800,
        date: '2024-01-01',
        accountId: 'investor1',
        fromAccountId: 'investor1',
        toAccountId: 'bank2',
        projectId: 'p1',
      }),
    ],
  });

  const projectWideResult = validateWithdrawal(state, 'p1', 900, '2024-01-31', {
    mode: 'percent',
    percent: 0,
  });
  assert.equal(projectWideResult.ok, true, 'project-wide cash is sufficient for this withdrawal');

  const accountResult = validateWithdrawalFromAccount(state, 'p1', 'bank1', 900, '2024-01-31', {
    mode: 'percent',
    percent: 0,
  });
  assert.equal(accountResult.ok, false, 'payouts must not overdraw the selected cash account');
  assert.equal(accountResult.sourceAccountAvailable, 200);
}

console.log('withdrawalValidation tests passed');
