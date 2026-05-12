/**
 * Profit & loss engine: structure, formulas, and ledger alignment on small synthetic states.
 * Run: npx tsx tests/profitLossEngine.test.ts
 */
import type { AppState, Category, Transaction, Account, Project, Bill } from '../types';
import { TransactionType, AccountType, InvoiceStatus } from '../types';
import { computeProfitLossReport } from '../components/reports/profitLossEngine';
import { computeProjectProfitLossTotals } from '../components/reports/projectProfitLossComputation';
import { CANONICAL_PROFIT_DISTRIBUTION_EXPENSE_CATEGORY_ID } from '../services/database/resolveProfitDistributionExpenseCategory';

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
  return state;
}

function tx(p: Partial<Transaction> & Pick<Transaction, 'id' | 'amount' | 'date' | 'type' | 'accountId'>): Transaction {
  return {
    ...p,
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

// 5) Profit-distribution expense category (sys-cat-profit-share) must not affect P&L
{
  const profitShareCat: Category = {
    id: CANONICAL_PROFIT_DISTRIBUTION_EXPENSE_CATEGORY_ID,
    name: 'Profit Share',
    type: TransactionType.EXPENSE,
    plSubType: 'operating_expense',
  };
  const inner = baseState();
  const s = baseState({
    categories: [...inner.categories, profitShareCat],
    transactions: [
      tx({
        id: 'pd',
        amount: 800_000,
        date: '2025-08-01',
        type: TransactionType.EXPENSE,
        accountId: 'acc-bank',
        categoryId: CANONICAL_PROFIT_DISTRIBUTION_EXPENSE_CATEGORY_ID,
        projectId: 'proj-1',
      }),
      tx({
        id: 'rev',
        amount: 1_000_000,
        date: '2025-08-02',
        type: TransactionType.INCOME,
        accountId: 'acc-bank',
        categoryId: 'cat-inc',
        projectId: 'proj-1',
      }),
    ],
  });
  const pl = computeProjectProfitLossTotals(s, 'proj-1', '2025-01-01', '2025-12-31');
  assertClose(pl.netProfit, 1_000_000, 'distribution expense excluded from P&L');
}

// 6) Supplier-prepaid duplicate suppression must not drop unrelated same-amount vendor expenses
{
  const accruedBill: Bill = {
    id: 'bill-1',
    billNumber: 'B-100',
    vendorId: 'vendor-1',
    amount: 1000,
    paidAmount: 500,
    status: InvoiceStatus.PARTIALLY_PAID,
    issueDate: '2025-09-01',
    description: '[Payment record] Bill #B-100: Paid from supplier prepaid advance (500.00).',
    projectId: 'proj-1',
    expenseCategoryItems: [
      {
        id: 'line-1',
        categoryId: 'cat-cogs',
        unit: 'quantity',
        quantity: 1,
        pricePerUnit: 1000,
        netValue: 1000,
      },
    ],
  };
  const s = baseState({
    bills: [accruedBill],
    transactions: [
      tx({
        id: 'actual-prepaid',
        amount: 500,
        date: '2025-08-30',
        type: TransactionType.EXPENSE,
        accountId: 'acc-bank',
        categoryId: 'cat-cogs',
        projectId: 'proj-1',
        vendorId: 'vendor-1',
        description: 'Supplier prepaid advance to vendor for B-100',
      }),
      tx({
        id: 'unrelated-materials',
        amount: 500,
        date: '2025-09-03',
        type: TransactionType.EXPENSE,
        accountId: 'acc-bank',
        categoryId: 'cat-cogs',
        projectId: 'proj-1',
        vendorId: 'vendor-1',
        description: 'Materials purchased for site',
      }),
    ],
  });

  const pl = computeProjectProfitLossTotals(s, 'proj-1', '2025-01-01', '2025-12-31');
  assertClose(pl.totalExpense, 1500, 'same-amount unrelated vendor expense remains in P&L');
  assertClose(pl.netProfit, -1500, 'net profit includes bill accrual plus unrelated expense only');
}

console.log('profitLossEngine.test.ts: OK');
