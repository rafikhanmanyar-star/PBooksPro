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

export interface CashFlowMonthPoint {
  month: string;
  label: string;
  inflow: number;
  outflow: number;
  net: number;
}

export interface AccountBalanceRow {
  accountId: string;
  accountName: string;
  balance: number;
  type: string;
}

export interface MovementTypeSlice {
  name: string;
  value: number;
}

export interface BankingAnalyticsResponse {
  filters: BankingAnalyticsFilters;
  generatedAt: string;
  kpis: BankingKpiValue[];
  cashFlowTrend: CashFlowMonthPoint[];
  accountBalances: AccountBalanceRow[];
  movementBreakdown: MovementTypeSlice[];
}
