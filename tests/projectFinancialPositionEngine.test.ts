import assert from 'node:assert/strict';
import { TransactionType, InvoiceStatus, InvoiceType } from '../types';
import type { AppState, Bill, Invoice, Project, Contract, Unit } from '../types';
import { computeProjectFinancialPosition } from '../components/reports/projectFinancialPositionEngine';

function baseState(overrides: Partial<AppState> = {}): AppState {
  return {
    users: [],
    currentUser: null,
    accounts: [{ id: 'bank', name: 'Bank', type: 'Bank' as never, balance: 0 }],
    contacts: [],
    vendors: [{ id: 'v1', name: 'Vendor' }],
    categories: [{ id: 'cat-exp', name: 'Opex', type: TransactionType.EXPENSE }],
    projects: [{ id: 'p1', name: 'Tower A', description: '', color: '#000', status: 'Active' }],
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
    ...overrides,
  } as AppState;
}

{
  const inv: Invoice = {
    id: 'inv1',
    invoiceNumber: 'INV-1',
    amount: 1000,
    paidAmount: 400,
    status: InvoiceStatus.PAID,
    issueDate: '2025-06-01',
    dueDate: '2025-06-30',
    invoiceType: InvoiceType.INSTALLMENT,
    projectId: 'p1',
  };
  const bill: Bill = {
    id: 'b1',
    billNumber: 'B-1',
    amount: 500,
    paidAmount: 100,
    status: InvoiceStatus.PAID,
    issueDate: '2025-06-02',
    projectId: 'p1',
    contractId: 'c1',
  };
  const contract: Contract = {
    id: 'c1',
    contractNumber: 'C-1',
    name: 'Civil works',
    projectId: 'p1',
    vendorId: 'v1',
    totalAmount: 10000,
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    status: 'Active' as never,
    categoryIds: [],
    retentionType: 'PERCENTAGE',
    retentionPercentage: 10,
    retentionReleased: 200,
  };
  const unit: Unit = {
    id: 'u1',
    name: '101',
    projectId: 'p1',
    salePrice: 200000,
    status: 'available',
  };
  const report = computeProjectFinancialPosition(
    baseState({ invoices: [inv], bills: [bill], contracts: [contract], units: [unit] }),
    { asOfDate: '2025-12-31', selectedProjectId: 'p1' }
  );
  assert.equal(report.dashboard.receivables, 600);
  assert.equal(report.liabilities.find((l) => l.key === 'contractor_payables')?.amount, 400);
  assert.equal(report.kpis.billingValue, 1000);
  assert.equal(report.kpis.collectionValue, 400);
  assert.equal(report.kpis.contractValue, 10000);
  assert.ok(report.netPosition === report.totalAssets - report.totalLiabilities);
}

{
  const unit: Unit = {
    id: 'u-sold',
    name: 'A-101',
    projectId: 'p1',
    salePrice: 4915000,
    status: 'available',
  };
  const agreement = {
    id: 'pa1',
    projectId: 'p1',
    clientId: 'c1',
    unitIds: ['u-sold'],
    sellingPrice: 4915000,
    issueDate: '2026-01-01',
    status: 'Active',
  } as AppState['projectAgreements'][0];
  const mkInv = (id: string, amount: number, issueDate: string): Invoice => ({
    id,
    invoiceNumber: id,
    amount,
    paidAmount: 0,
    status: InvoiceStatus.UNPAID,
    issueDate,
    dueDate: issueDate,
    invoiceType: InvoiceType.INSTALLMENT,
    projectId: 'p1',
    unitId: 'u-sold',
    agreementId: 'pa1',
    contactId: 'c1',
  });
  const report = computeProjectFinancialPosition(
    baseState({
      units: [unit],
      projectAgreements: [agreement],
      invoices: [
        mkInv('inv-dp', 2460000, '2026-01-01'),
        mkInv('inv-2', 1227500, '2027-01-01'),
        mkInv('inv-3', 1227500, '2028-01-01'),
      ],
    }),
    { asOfDate: '2026-06-30', selectedProjectId: 'p1' }
  );
  assert.equal(report.dashboard.receivables, 4915000);
  assert.equal(report.assets.find((a) => a.key === 'inventory_units')?.amount, 0);
  assert.equal(report.dashboard.netPosition, 4915000);
  assert.equal(report.kpis.billingValue, 4915000);
}

console.log('projectFinancialPositionEngine.test.ts: OK');
