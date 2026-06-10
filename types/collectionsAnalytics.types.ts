export interface CollectionsAnalyticsFilters {
  from: string;
  to: string;
  projectId?: string;
  propertyId?: string;
}

export interface CollectionsKpiValue {
  id: string;
  label: string;
  value: number;
  format: 'currency' | 'percent' | 'count';
}

export interface CollectionsAnalyticsResponse {
  filters: CollectionsAnalyticsFilters;
  generatedAt: string;
  kpis: CollectionsKpiValue[];
  collectionsPerformance: { month: string; label: string; due: number; collected: number; outstanding: number }[];
  receivablesAging: { label: string; value: number }[];
  invoiceTypeBreakdown: { name: string; value: number }[];
  topDebtors: { contactId: string; contactName: string; outstanding: number }[];
}
