import type pg from 'pg';
import {
  isValidDateOnly,
  parseDashboardFilters,
} from '../dashboard/dashboardMetricsHelpers.js';
import type { DashboardFilters } from '../dashboard/dashboardMetricsTypes.js';
import { computeSnapshot } from '../dashboard/dashboardMetricsService.js';
import type { DashboardKpiAggregationResponse } from './types.js';

async function sumOwnerPayables(client: pg.PoolClient, tenantId: string): Promise<number> {
  const r = await client.query<{ total: string }>(
    `SELECT COALESCE(SUM(GREATEST(balance, 0)), 0)::text AS total
     FROM owner_balances
     WHERE tenant_id = $1`,
    [tenantId]
  );
  return Number(r.rows[0]?.total ?? 0);
}

async function countOverdueInvoices(client: pg.PoolClient, tenantId: string): Promise<number> {
  const r = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM invoices i
     WHERE i.tenant_id = $1
       AND i.deleted_at IS NULL
       AND i.invoice_type IN ('Rental', 'Service Charge')
       AND i.due_date < CURRENT_DATE
       AND GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0) > 0
       AND (i.description IS NULL OR i.description NOT LIKE '%VOIDED%')`,
    [tenantId]
  );
  return Number(r.rows[0]?.c ?? 0);
}

export async function getDashboardKpiAggregation(
  client: pg.PoolClient,
  tenantId: string,
  filters: DashboardFilters
): Promise<DashboardKpiAggregationResponse> {
  const [snapshot, ownerPayables, overdueInvoices] = await Promise.all([
    computeSnapshot(client, tenantId, filters),
    sumOwnerPayables(client, tenantId),
    countOverdueInvoices(client, tenantId),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    from: filters.from,
    to: filters.to,
    revenue: snapshot.revenue,
    expenses: snapshot.expenses,
    netIncome: snapshot.netIncome,
    occupancyRate: snapshot.occupancyRate,
    ownerPayables,
    overdueInvoices,
  };
}

export function parseDashboardKpiFilters(query: Record<string, unknown>): DashboardFilters | null {
  const filters = parseDashboardFilters(query);
  if (!isValidDateOnly(filters.from) || !isValidDateOnly(filters.to)) return null;
  if (filters.from > filters.to) return null;
  return filters;
}
