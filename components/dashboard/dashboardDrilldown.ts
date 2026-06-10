import type { KpiDefinition } from '../../types';
import type { DashboardMetricValue } from '../../types/dashboardMetrics.types';

/** Maps new executive dashboard metric ids → legacy KPI panel definitions for drill-down. */
export const METRIC_DRILLDOWN_IDS: Record<string, string> = {
  totalCashBalance: 'totalBalance',
  bankBalance: 'totalBalance',
  accountsReceivable: 'accountsReceivable',
  accountsPayable: 'accountsPayable',
  netIncome: 'netIncome',
  revenue: 'totalIncome',
  expenses: 'totalExpense',
  operatingCashFlow: 'netIncome',
  outstandingReceivables: 'accountsReceivable',
  collectionRate: 'projectReceivable',
  occupancyRate: 'occupiedUnits',
  activeRentalProperties: 'occupiedUnits',
  securityDepositsHeld: 'securityDepositHeld',
  unitsAvailable: 'vacantUnits',
  unitsSold: 'projectReceivable',
};

export function resolveDrilldownKpi(
  metric: DashboardMetricValue,
  allKpis: KpiDefinition[]
): KpiDefinition | null {
  const legacyId = METRIC_DRILLDOWN_IDS[metric.id];
  if (!legacyId) return null;
  return allKpis.find((k) => k.id === legacyId) ?? null;
}
