/**
 * Rental security-deposit settlement effects: paired liability rows must not settle bills twice.
 * Run: npx tsx tests/rentalSecurityDepositSettlement.test.ts
 */
import type { AppState, Bill, Transaction } from '../types';
import { AccountType, InvoiceStatus, TransactionType } from '../types';
import { applyTransactionEffectOnly } from '../utils/rentalSecurityDepositSettlement';

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

const bill: Bill = {
  id: 'bill-1',
  billNumber: 'B-001',
  contactId: 'vendor-1',
  amount: 500,
  paidAmount: 200,
  status: InvoiceStatus.PARTIALLY_PAID,
  issueDate: '2026-05-01',
  dueDate: '2026-05-31',
  categoryId: 'cat-repair',
  propertyId: 'property-1',
};

const baseState: AppState = {
  users: [],
  currentUser: null,
  accounts: [{ id: 'bank-1', name: 'Bank', type: AccountType.BANK, balance: 1000 }],
  contacts: [],
  vendors: [],
  categories: [],
  projects: [],
  buildings: [],
  properties: [],
  units: [],
  transactions: [],
  invoices: [],
  bills: [bill],
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
};

const liabilityReleaseExpense: Transaction = {
  id: 'security-liability-release-1',
  type: TransactionType.EXPENSE,
  amount: 200,
  date: '2026-05-12',
  accountId: 'bank-1',
  categoryId: 'cat-security-refund',
  contactId: 'tenant-1',
  billId: bill.id,
  description: 'Security deposit applied - Bill B-001',
};

const next = applyTransactionEffectOnly(baseState, liabilityReleaseExpense, true);
assertEqual(
  next.bills[0].paidAmount,
  200,
  'security-deposit liability release should not increase bill paid amount'
);
assertEqual(
  next.bills[0].status,
  InvoiceStatus.PARTIALLY_PAID,
  'security-deposit liability release should not change bill status'
);

console.log('rentalSecurityDepositSettlement tests passed');
