export type CollectionsScope = 'all' | 'project' | 'rental';

export interface CollectionsAnalyticsFilters {
  from: string;
  to: string;
  scope?: CollectionsScope;
  projectId?: string;
  propertyId?: string;
}

export interface CollectionsKpiValue {
  id: string;
  label: string;
  value: number;
  format: 'currency' | 'percent' | 'count';
}

export interface CollectionsMonthPoint {
  month: string;
  label: string;
  due: number;
  collected: number;
  outstanding: number;
}

export interface AgingBucket {
  label: string;
  value: number;
}

export interface InvoiceTypeSlice {
  name: string;
  value: number;
}

export interface DebtorRow {
  contactId: string;
  contactName: string;
  outstanding: number;
}

export interface CollectionsAnalyticsResponse {
  filters: CollectionsAnalyticsFilters;
  generatedAt: string;
  kpis: CollectionsKpiValue[];
  collectionsPerformance: CollectionsMonthPoint[];
  receivablesAging: AgingBucket[];
  invoiceTypeBreakdown: InvoiceTypeSlice[];
  topDebtors: DebtorRow[];
}
