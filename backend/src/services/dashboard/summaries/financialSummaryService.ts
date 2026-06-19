import type pg from 'pg';
import { computeSnapshot } from '../dashboardMetricsService.js';
import type { DashboardFilters } from '../dashboardMetricsTypes.js';
import type { FinancialSummaryResponse } from './types.js';

export async function getFinancialSummary(
  client: pg.PoolClient,
  tenantId: string,
  filters: DashboardFilters
): Promise<FinancialSummaryResponse> {
  const snapshot = await computeSnapshot(client, tenantId, filters);
  return {
    generatedAt: new Date().toISOString(),
    from: filters.from,
    to: filters.to,
    revenue: snapshot.revenue,
    expenses: snapshot.expenses,
    netIncome: snapshot.netIncome,
    cashPosition: snapshot.totalCashBalance,
    bankBalance: snapshot.bankBalance,
    accountsReceivable: snapshot.accountsReceivable,
    accountsPayable: snapshot.accountsPayable,
    operatingCashFlow: snapshot.operatingCashFlow,
  };
}
