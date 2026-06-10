/** Server-side dashboard types (mirrors client contract). */

export type DashboardMetricGroup = 'financial' | 'realEstate' | 'activity';

export type MetricFormat = 'currency' | 'percent' | 'count';

export type MetricStatus = 'positive' | 'negative' | 'neutral' | 'warning';

export type DashboardComparisonPeriod = 'previous_period' | 'previous_year' | 'none';

export interface DashboardFilters {
  from: string;
  to: string;
  comparisonPeriod: DashboardComparisonPeriod;
  projectId?: string;
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

export interface RawMetricSnapshot {
  totalCashBalance: number;
  bankBalance: number;
  accountsReceivable: number;
  accountsPayable: number;
  netIncome: number;
  revenue: number;
  expenses: number;
  operatingCashFlow: number;
  activeProjects: number;
  unitsAvailable: number;
  unitsSold: number;
  collectionRate: number;
  outstandingReceivables: number;
  activeRentalProperties: number;
  occupancyRate: number;
  securityDepositsHeld: number;
  newCustomers: number;
  newVendors: number;
  newAgreements: number;
  newBookings: number;
  newReceipts: number;
  newPayments: number;
}
