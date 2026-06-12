/** Tenant Reporting Center — Rental */

export type RentalReportTab =
  | 'ledger'
  | 'receivable'
  | 'defaulters'
  | 'schedule'
  | 'collection-performance';

export interface RentalReportingFilters {
  from: string;
  to: string;
  buildingId?: string;
  propertyId?: string;
  tenantId?: string;
  status?: string;
  ownerId?: string;
  brokerId?: string;
}

export interface ReportingKpi {
  id: string;
  label: string;
  value: number;
  format: 'currency' | 'count';
}

export interface AgingBucket {
  bucket: 'current' | '1-30' | '31-60' | '61-90' | '90+';
  label: string;
  amount: number;
  entityCount: number;
}

export interface RentalReportingSummary {
  filters: RentalReportingFilters;
  generatedAt: string;
  kpis: ReportingKpi[];
  aging: AgingBucket[];
}

export interface PaginatedReportRows<T> {
  rows: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface TenantLedgerRow {
  id: string;
  date: string;
  tenantId: string;
  tenantName: string;
  propertyName: string;
  buildingName: string;
  particulars: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface RentalReceivableRow {
  id: string;
  tenantId: string;
  tenantName: string;
  propertyName: string;
  buildingName: string;
  agreementNo: string;
  monthlyRent: number;
  invoiced: number;
  collected: number;
  outstanding: number;
  overdueAmount: number;
  status: string;
}

export interface TenantDefaulterRow {
  id: string;
  tenantId: string;
  tenantName: string;
  propertyName: string;
  overdueInvoices: number;
  overdueAmount: number;
  oldestDueDate: string;
  daysPastDue: number;
}

export interface RentScheduleRow {
  id: string;
  tenantId: string;
  tenantName: string;
  propertyName: string;
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

export interface Tenant360Detail {
  profile: {
    contactId: string;
    name: string;
    contactNo?: string;
    companyName?: string;
    address?: string;
    description?: string;
  };
  properties: {
    propertyId: string;
    propertyName: string;
    buildingName: string;
    agreementNo: string;
    status: string;
    monthlyRent: number;
  }[];
  financial: {
    monthlyRent: number;
    invoiced: number;
    collected: number;
    outstanding: number;
    overdueAmount: number;
  };
  payments: { id: string; date: string; amount: number; description: string; invoiceNumber?: string }[];
  notes: string[];
  documents: { id: string; name: string; type: string; fileName: string; createdAt?: string }[];
}
