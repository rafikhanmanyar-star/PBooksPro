/**
 * Profit & loss engine: structure, formulas, and ledger alignment on small synthetic states.
 * Run: npx tsx tests/profitLossEngine.test.ts
 */
import type { AppState, Category, Transaction, Account, Project } from '../types';
import { TransactionType, AccountType } from '../types';
import { computeProfitLossReport } from '../components/reports/profitLossEngine';

function baseState(overrides: Partial<AppState> = {}): AppState {
  const incomeCat: Category = {
    id: 'cat-inc',
    name: 'Sales',
    type: TransactionType.INCOME,
    plSubType: 'revenue',
  };
  const cogsCat: Category = {
    id: 'cat-cogs',
    name: 'Materials',
    type: TransactionType.EXPENSE,
    plSubType: 'cost_of_sales',
  };
  const opexCat: Category = {
    id: 'cat-opex',
    name: 'Admin',
    type: TransactionType.EXPENSE,
    plSubType: 'operating_expense',
  };
  const finCat: Category = {
    id: 'cat-fin',
    name: 'Interest',
    type: TransactionType.EXPENSE,
    plSubType: 'finance_cost',
  };
  const taxCat: Category = {
    id: 'cat-tax',
    name: 'Tax',
    type: TransactionType.EXPENSE,
    plSubType: 'tax',
  };
  const bank: Account = { id: 'acc-bank', name: 'Bank', type: AccountType.BANK, balance: 0 };
  const proj: Project = { id: 'proj-1', name: 'P1', description: '', color: '#000', status: 'Active' };

  const state: AppState = {
    users: [],
    currentUser: null,
    accounts: [bank],
    contacts: [],
    vendors: [],
    categories: [incomeCat, cogsCat, opexCat, finCat, taxCat],
    projects: [proj],
    buildings: [],
    properties: [],
    propertyOwnershipHistory: [],
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
      companyName: 'T',
      companyAddress: '',
      companyContact: '',
      showLogo: false,
      showDatePrinted: false,
    },
    whatsAppTemplates: {} as AppState['whatsAppTemplates'],
    dashboardConfig: { visibleKpis: [] },
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
  return state;
}

function tx(p: Partial<Transaction> & Pick<Transaction, 'id' | 'amount' | 'date' | 'type' | 'accountId'>): Transaction {
  return {
    id: p.id,
    amount: p.amount,
    date: p.date,
    type: p.type,
    accountId: p.accountId,
    categoryId: p.categoryId,
    projectId: p.projectId,
    description: p.description,
  } as Transaction;
}

function assertClose(a: number, b: number, label: string) {
  if (Math.abs(a - b) > 0.02) {
    throw new Error(`${label}: expected ${b}, got ${a}`);
  }
}

// 1) With COGS
{
  const s = baseState({
    transactions: [
      tx({
        id: 't1',
        amount: 1000,
        date: '2025-06-01',
        type: TransactionType.INCOME,
        accountId: 'acc-bank',
        categoryId: 'cat-inc',
        projectId: 'proj-1',
      }),
      tx({
        id: 't2',
        amount: 300,
        date: '2025-06-02',
        type: TransactionType.EXPENSE,
        accountId: 'acc-bank',
        categoryId: 'cat-cogs',
        projectId: 'proj-1',
      }),
      tx({
        id: 't3',
        amount: 200,
        date: '2025-06-03',
        type: TransactionType.EXPENSE,
        accountId: 'acc-bank',
        categoryId: 'cat-opex',
        projectId: 'proj-1',
      }),
    ],
  });
  const r = computeProfitLossReport(s, {
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    selectedProjectId: 'proj-1',
  });
  assertClose(r.gross_profit, 700, 'gross');
  assertClose(r.operating_profit, 500, 'op profit');
  assertClose(r.net_profit, 500, 'net');
  assertClose(r.validation.legacyNetProfit, r.net_profit, 'ledger match');
}

// 2) Without COGS (only revenue + opex)
{
  const s = baseState({
    transactions: [
      tx({
        id: 't1',
        amount: 500,
        date: '2025-06-01',
        type: TransactionType.INCOME,
        accountId: 'acc-bank',
        categoryId: 'cat-inc',
        projectId: 'proj-1',
      }),
      tx({
        id: 't2',
        amount: 100,
        date: '2025-06-02',
        type: TransactionType.EXPENSE,
        accountId: 'acc-bank',
        categoryId: 'cat-opex',
        projectId: 'proj-1',
      }),
    ],
  });
  const r = computeProfitLossReport(s, {
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    selectedProjectId: 'proj-1',
  });
  assertClose(r.gross_profit, 500, 'gross no cogs');
  assertClose(r.operating_profit, 400, 'op');
  assertClose(r.validation.legacyNetProfit, 400, 'legacy');
}

// 3) Loan interest + tax
{
  const s = baseState({
    transactions: [
      tx({
        id: 't1',
        amount: 2000,
        date: '2025-06-01',
        type: TransactionType.INCOME,
        accountId: 'acc-bank',
        categoryId: 'cat-inc',
        projectId: 'proj-1',
      }),
      tx({
        id: 't2',
        amount: 50,
        date: '2025-06-02',
        type: TransactionType.EXPENSE,
        accountId: 'acc-bank',
        categoryId: 'cat-fin',
        projectId: 'proj-1',
      }),
      tx({
        id: 't3',
        amount: 100,
        date: '2025-06-03',
        type: TransactionType.EXPENSE,
        accountId: 'acc-bank',
        categoryId: 'cat-tax',
        projectId: 'proj-1',
      }),
    ],
  });
  const r = computeProfitLossReport(s, {
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    selectedProjectId: 'proj-1',
  });
  assertClose(r.profit_before_tax, 1950, 'pbt');
  assertClose(r.net_profit, 1850, 'net after tax');
  assertClose(r.validation.legacyNetProfit, r.net_profit, 'ledger');
}

// 4) Large dataset smoke (many lines)
{
  const txs: Transaction[] = [];
  for (let i = 0; i < 500; i++) {
    txs.push(
      tx({
        id: `ti-${i}`,
        amount: 10,
        date: '2025-07-15',
        type: TransactionType.INCOME,
        accountId: 'acc-bank',
        categoryId: 'cat-inc',
        projectId: 'proj-1',
      })
    );
  }
  const s = baseState({ transactions: txs });
  const r = computeProfitLossReport(s, {
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    selectedProjectId: 'proj-1',
  });
  assertClose(r.totalRevenue, 5000, 'bulk revenue');
  assertClose(r.validation.legacyNetProfit, 5000, 'bulk net');
}

console.log('profitLossEngine.test.ts: OK');
