export type ExpenseScope = 'all' | 'project' | 'rental';

export interface ExpenseAnalyticsFilters {
  from: string;
  to: string;
  scope?: ExpenseScope;
  projectId?: string;
  propertyId?: string;
}

export interface ExpenseKpiValue {
  id: string;
  label: string;
  value: number;
  format: 'currency' | 'percent' | 'count';
}

export interface ExpenseMonthPoint {
  month: string;
  label: string;
  amount: number;
}

export interface BillStatusSlice {
  name: string;
  value: number;
}

export interface VendorSpendRow {
  vendorId: string;
  vendorName: string;
  amount: number;
}

export interface ExpenseAnalyticsResponse {
  filters: ExpenseAnalyticsFilters;
  generatedAt: string;
  kpis: ExpenseKpiValue[];
  expenseTrend: ExpenseMonthPoint[];
  categoryBreakdown: { name: string; value: number }[];
  billStatus: BillStatusSlice[];
  vendorSpend: VendorSpendRow[];
}
