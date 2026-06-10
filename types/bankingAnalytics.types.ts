export interface BankingAnalyticsFilters {
  from: string;
  to: string;
  accountId?: string;
}

export interface BankingKpiValue {
  id: string;
  label: string;
  value: number;
  format: 'currency' | 'percent' | 'count';
}

export interface BankingAnalyticsResponse {
  filters: BankingAnalyticsFilters;
  generatedAt: string;
  kpis: BankingKpiValue[];
  cashFlowTrend: { month: string; label: string; inflow: number; outflow: number; net: number }[];
  accountBalances: { accountId: string; accountName: string; balance: number; type: string }[];
  movementBreakdown: { name: string; value: number }[];
}
