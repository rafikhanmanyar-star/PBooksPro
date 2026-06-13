/** Shared dashboard analytics types (client + server contract). */

export type DashboardMetricGroup = 'financial' | 'realEstate' | 'activity';

export type MetricFormat = 'currency' | 'percent' | 'count';

export type MetricStatus = 'positive' | 'negative' | 'neutral' | 'warning';

export type DashboardComparisonPeriod = 'previous_period' | 'previous_year' | 'none';

export interface DashboardFilters {
  from: string;
  to: string;
  comparisonPeriod: DashboardComparisonPeriod;
  projectId?: string;
  buildingId?: string;
  propertyId?: string;
  vendorId?: string;
  customerId?: string;
  branchId?: string;
  companyId?: string;
  salesAgentId?: string;
}

export interface DashboardMetricValue {
  id: string;
  label: string;
  group: DashboardMetricGroup;
  value: number;
  previousValue?: number;
  trendPercent?: number;
  format: MetricFormat;
  status?: MetricStatus;
  description?: string;
}

export interface DashboardMetricsResponse {
  filters: DashboardFilters;
  generatedAt: string;
  financial: DashboardMetricValue[];
  realEstate: DashboardMetricValue[];
  activity: DashboardMetricValue[];
}

export type DashboardDatePreset =
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_year'
  | 'last_30_days'
  | 'custom';

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

export interface DashboardActivityItem {
  id: string;
  type: 'Invoice' | 'Income' | 'Expense';
  title: string;
  amount: number;
  date: string;
}

export interface DashboardActivityResponse {
  items: DashboardActivityItem[];
  generatedAt: string;
}
