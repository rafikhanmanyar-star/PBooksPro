import type { DashboardFilters } from './dashboardMetricsTypes.js';

export interface MonthlyTrendPoint {
  month: string;
  label: string;
  revenue: number;
  expenses: number;
}

export interface CashFlowTrendPoint {
  month: string;
  label: string;
  inflow: number;
  outflow: number;
  net: number;
}

export interface AgingBucket {
  label: string;
  value: number;
}

export interface PipelineSlice {
  name: string;
  value: number;
}

export interface ExpenseBreakdownSlice {
  name: string;
  value: number;
}

export interface CollectionsMonthPoint {
  month: string;
  label: string;
  due: number;
  collected: number;
  outstanding: number;
}

export interface DashboardChartsResponse {
  filters: DashboardFilters;
  year: number;
  generatedAt: string;
  revenueVsExpenses: MonthlyTrendPoint[];
  cashFlowTrend: CashFlowTrendPoint[];
  receivablesAging: AgingBucket[];
  salesPipeline: PipelineSlice[];
  expenseBreakdown: ExpenseBreakdownSlice[];
  collectionsPerformance: CollectionsMonthPoint[];
}
