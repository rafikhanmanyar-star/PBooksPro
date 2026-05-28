/**
 * Investor withdrawal liquidity guard.
 * Run: npx tsx tests/validateWithdrawal.test.ts
 */
import type { Account, AppState, Bill, Project, Transaction } from '../types';
import { AccountType, EquityLedgerSubtype, InvoiceStatus, TransactionType } from '../types';
import { validateProjectWithdrawalOutflow } from '../modules/investor-fund-availability/utils/validateWithdrawal';

function baseState(overrides: Partial<AppState> = {}): AppState {
  const bank: Account = { id: 'bank-1', name: 'Bank', type: AccountType.BANK, balance: 0 };
  const investor: Account = { id: 'investor-1', name: 'Investor', type: AccountType.EQUITY, balance: 0 };
  const project: Project = { id: 'project-1', name: 'Project', description: '', color: '#000000', status: 'Active' };

  return {
    users: [],
    currentUser: null,
    accounts: [bank, investor],
    contacts: [],
    vendors: [],
    categories: [],
    projects: [project],
    buildings: [],
    properties: [],
    units: [],
    transactions: [],
    invoices: [],
    bills: [],
    rentalAgreements: [],
    projectAgreements: [],
    salesReturns: [],
    projectReceivedAssets: [],
    contracts: [],
    budgets: [],
    personalCategories: [],
    personalTransactions: [],
    recurringInvoiceTemplates: [],
    printSettings: {
      companyName: 'Test',
      companyAddress: '',
      companyContact: '',
      showLogo: false,
      showDatePrinted: false,
    },
    whatsAppTemplates: {} as AppState['whatsAppTemplates'],
    dashboardConfig: { visibleKpis: [] },
    accountConsistency: { actualByAccountId: {} },
    installmentPlans: [],
    planAmenities: [],
    agreementSettings: { prefix: '', nextNumber: 1, padding: 1 },
    projectAgreementSettings: { prefix: '', nextNumber: 1, padding: 1 },
    rentalInvoiceSettings: { prefix: '', nextNumber: 1, padding: 1, autoSendInvoiceWhatsApp: false },
    projectInvoiceSettings: { prefix: '', nextNumber: 1, padding: 1 },
    showSystemTransactions: false,
    enableColorCoding: false,
    enableBeepOnSave: false,
    enableDatePreservation: false,
    whatsAppMode: 'manual',
    pmCostPercentage: 0,
    errorLog: [],
    transactionLog: [],
    currentPage: 'dashboard',
    editingEntity: null,
    initialTransactionType: null,
    initialTransactionFilter: null,
    initialTabs: [],
    initialImportType: null,
    quotations: [],
    documents: [],
    ...overrides,
  };
}

function investment(amount: number): Transaction {
  return {
    id: 'investment-1',
    type: TransactionType.TRANSFER,
    subtype: EquityLedgerSubtype.INVESTMENT,
    amount,
    date: '2026-05-01',
    accountId: 'investor-1',
    fromAccountId: 'investor-1',
    toAccountId: 'bank-1',
    projectId: 'project-1',
  };
}

function unpaidBill(amount: number): Bill {
  return {
    id: 'bill-1',
    billNumber: 'B-1',
    amount,
    paidAmount: 0,
    status: InvoiceStatus.UNPAID,
    issueDate: '2026-05-10',
    projectId: 'project-1',
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

{
  const state = baseState({
    transactions: [investment(1000)],
    bills: [unpaidBill(700)],
  });

  const result = validateProjectWithdrawalOutflow({
    state,
    projectId: 'project-1',
    amount: 200,
    asOfYmd: '2026-05-28',
    reservePolicy: { mode: 'percent', percent: 20 },
  });

  assert(!result.ok, 'capital payout over distributable funds should be rejected');
  assert(result.distributableFunds === 100, `expected distributable funds of 100, got ${result.distributableFunds}`);
  assert(result.shortfall === 100, `expected shortfall of 100, got ${result.shortfall}`);
}

{
  const state = baseState({
    transactions: [investment(1000)],
    bills: [unpaidBill(700)],
  });

  const result = validateProjectWithdrawalOutflow({
    state,
    projectId: 'project-1',
    amount: 100,
    asOfYmd: '2026-05-28',
    reservePolicy: { mode: 'percent', percent: 20 },
  });

  assert(result.ok, 'capital payout within distributable funds should be allowed');
}

console.log('validateWithdrawal tests passed');
