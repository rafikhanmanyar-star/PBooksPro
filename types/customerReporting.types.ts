/** Customer Reporting Center — Project Selling */

export type CustomerReportTab =
  | 'ledger'
  | 'receivable'
  | 'defaulters'
  | 'installments'
  | 'collection-performance';

export interface CustomerReportingFilters {
  from: string;
  to: string;
  projectId?: string;
  customerId?: string;
  unitId?: string;
  status?: string;
  salesAgentId?: string;
}

export interface CustomerReportingKpi {
  id: string;
  label: string;
  value: number;
  format: 'currency' | 'count';
}

export interface CustomerAgingBucket {
  bucket: 'current' | '1-30' | '31-60' | '61-90' | '90+';
  label: string;
  amount: number;
  customerCount: number;
}

export interface CustomerReportingSummary {
  filters: CustomerReportingFilters;
  generatedAt: string;
  kpis: CustomerReportingKpi[];
  aging: CustomerAgingBucket[];
}

export interface PaginatedReportRows<T> {
  rows: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface CustomerLedgerRow {
  id: string;
  date: string;
  customerId: string;
  customerName: string;
  unitName: string;
  projectName: string;
  particulars: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface ReceivableReportRow {
  id: string;
  customerId: string;
  customerName: string;
  projectName: string;
  unitNames: string;
  agreementNo: string;
  sellingPrice: number;
  invoiced: number;
  collected: number;
  outstanding: number;
  overdueAmount: number;
  status: string;
}

export interface DefaulterReportRow {
  id: string;
  customerId: string;
  customerName: string;
  projectName: string;
  unitNames: string;
  overdueInstallments: number;
  overdueAmount: number;
  oldestDueDate: string;
  daysPastDue: number;
}

export interface InstallmentScheduleRow {
  id: string;
  customerId: string;
  customerName: string;
  projectName: string;
  unitName: string;
  invoiceNumber: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  balance: number;
  status: string;
}

export interface CollectionPerformanceRow {
  id: string;
  period: string;
  label: string;
  due: number;
  collected: number;
  outstanding: number;
  collectionRate: number;
}

export interface Customer360Profile {
  contactId: string;
  name: string;
  contactNo?: string;
  companyName?: string;
  address?: string;
  description?: string;
}

export interface Customer360Unit {
  unitId: string;
  unitName: string;
  projectName: string;
  agreementNo: string;
  status: string;
  sellingPrice: number;
}

export interface Customer360Financial {
  sellingPrice: number;
  invoiced: number;
  collected: number;
  outstanding: number;
  overdueAmount: number;
}

export interface Customer360Payment {
  id: string;
  date: string;
  amount: number;
  description: string;
  invoiceNumber?: string;
}

export interface Customer360Document {
  id: string;
  name: string;
  type: string;
  fileName: string;
  createdAt?: string;
}

export interface Customer360Detail {
  profile: Customer360Profile;
  units: Customer360Unit[];
  financial: Customer360Financial;
  payments: Customer360Payment[];
  notes: string[];
  documents: Customer360Document[];
}

export type QuickReportKey =
  | 'customer-statement'
  | 'customer-balance'
  | 'customer-ledger'
  | 'receivable-aging'
  | 'defaulters'
  | 'installment-due'
  | 'collection'
  | 'project-receivable'
  | 'agent-collection';
