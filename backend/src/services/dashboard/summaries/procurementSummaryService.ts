import type pg from 'pg';
import { getProcurementDashboardMetrics } from '../../../modules/vendors/services/quotationIntelligenceService.js';
import type { ProcurementSummaryResponse } from './types.js';

export async function getProcurementSummary(
  client: pg.PoolClient,
  tenantId: string
): Promise<ProcurementSummaryResponse> {
  const metrics = await getProcurementDashboardMetrics(client, tenantId);
  return {
    generatedAt: new Date().toISOString(),
    activeQuotations: metrics.activeQuotations,
    expiringQuotations: metrics.expiringQuotations,
    priceIncreaseAlerts: metrics.priceIncreaseAlerts,
    lowestVendorRatesCount: metrics.lowestVendorRates?.length ?? 0,
  };
}
