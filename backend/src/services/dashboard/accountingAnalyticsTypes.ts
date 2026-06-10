export interface AccountingAnalyticsFilters {
  from: string;
  to: string;
  projectId?: string;
}

export interface AccountingKpiValue {
  id: string;
  label: string;
  value: number;
  format: 'currency' | 'percent' | 'count';
}

export interface IncomeExpenseMonthPoint {
  month: string;
  label: string;
  income: number;
  expenses: number;
}

export interface BalanceSheetSnapshot {
  assets: number;
  liabilities: number;
  equity: number;
}

export interface CashAccountRow {
  id: string;
  name: string;
  balance: number;
}

export interface CategoryBreakdownSlice {
  name: string;
  value: number;
}

export interface AccountingAnalyticsResponse {
  filters: AccountingAnalyticsFilters;
  generatedAt: string;
  kpis: AccountingKpiValue[];
  incomeVsExpenseTrend: IncomeExpenseMonthPoint[];
  balanceSheetSnapshot: BalanceSheetSnapshot;
  cashPosition: CashAccountRow[];
  categoryBreakdown: CategoryBreakdownSlice[];
}
