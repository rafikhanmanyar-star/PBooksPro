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

export interface ExpenseAnalyticsResponse {
  filters: ExpenseAnalyticsFilters;
  generatedAt: string;
  kpis: ExpenseKpiValue[];
  expenseTrend: { month: string; label: string; amount: number }[];
  categoryBreakdown: { name: string; value: number }[];
  billStatus: { name: string; value: number }[];
  vendorSpend: { vendorId: string; vendorName: string; amount: number }[];
}
