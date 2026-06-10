import { useMemo } from 'react';
import { useDashboardMetrics } from './useDashboardMetrics';
import type { DashboardMetricValue, MetricFormat } from '../types/dashboardMetrics.types';

/** Maps KPI panel definition ids to executive dashboard metric ids (PostgreSQL API). */
const KPI_TO_METRIC_ID: Record<string, string> = {
  totalBalance: 'totalCashBalance',
  netIncome: 'netIncome',
  totalIncome: 'revenue',
  totalExpense: 'expenses',
  accountsReceivable: 'accountsReceivable',
  accountsPayable: 'accountsPayable',
  rentalArrears: 'outstandingReceivables',
  projectReceivable: 'outstandingReceivables',
  securityDepositHeld: 'securityDepositsHeld',
  rentalLiabilityHeld: 'securityDepositsHeld',
};

export interface KpiPanelServerMetric {
  value: number;
  trendPercent?: number;
  format?: MetricFormat;
}

function flattenMetrics(groups: {
  financial: DashboardMetricValue[];
  realEstate: DashboardMetricValue[];
  activity: DashboardMetricValue[];
}): Map<string, DashboardMetricValue> {
  const map = new Map<string, DashboardMetricValue>();
  for (const m of [...groups.financial, ...groups.realEstate, ...groups.activity]) {
    map.set(m.id, m);
  }
  return map;
}

/** Server-backed KPI values for the right panel when API metrics are available. */
export function useKpiPanelServerValues(enabled: boolean): Map<string, KpiPanelServerMetric> {
  const { data } = useDashboardMetrics(enabled);

  return useMemo(() => {
    const result = new Map<string, KpiPanelServerMetric>();
    if (!data) return result;

    const byMetricId = flattenMetrics({
      financial: data.financial,
      realEstate: data.realEstate,
      activity: data.activity,
    });

    for (const [kpiId, metricId] of Object.entries(KPI_TO_METRIC_ID)) {
      const m = byMetricId.get(metricId);
      if (m != null) {
        result.set(kpiId, {
          value: m.value,
          trendPercent: m.trendPercent,
          format: m.format,
        });
      }
    }
    return result;
  }, [data]);
}
