import type pg from 'pg';
import type {
  VendorBalanceAggregationRow,
  VendorBalancesAggregationResponse,
} from './types.js';

export type VendorBalanceAggregationFilters = {
  vendorId?: string;
  projectId?: string;
  buildingId?: string;
  propertyId?: string;
};

export async function getVendorBalancesAggregation(
  client: pg.PoolClient,
  tenantId: string,
  filters: VendorBalanceAggregationFilters = {}
): Promise<VendorBalancesAggregationResponse> {
  const params: unknown[] = [tenantId];
  const clauses: string[] = [
    'b.tenant_id = $1',
    'b.deleted_at IS NULL',
    'b.vendor_id IS NOT NULL',
    "TRIM(b.vendor_id) <> ''",
  ];

  if (filters.vendorId) {
    params.push(filters.vendorId);
    clauses.push(`b.vendor_id = $${params.length}`);
  }
  if (filters.projectId) {
    params.push(filters.projectId);
    clauses.push(`b.project_id = $${params.length}`);
  }
  if (filters.propertyId) {
    params.push(filters.propertyId);
    clauses.push(`b.property_id = $${params.length}`);
  }
  if (filters.buildingId) {
    params.push(filters.buildingId);
    clauses.push(
      `b.property_id IN (SELECT p.id FROM properties p WHERE p.tenant_id = $1 AND p.deleted_at IS NULL AND p.building_id = $${params.length})`
    );
  }

  const r = await client.query<{
    vendor_id: string;
    total_bills: string;
    total_payments: string;
    outstanding_balance: string;
  }>(
    `SELECT
       b.vendor_id,
       COALESCE(SUM(b.amount), 0)::text AS total_bills,
       COALESCE(SUM(COALESCE(b.paid_amount, 0)), 0)::text AS total_payments,
       COALESCE(SUM(GREATEST(b.amount - COALESCE(b.paid_amount, 0), 0)), 0)::text AS outstanding_balance
     FROM bills b
     WHERE ${clauses.join(' AND ')}
     GROUP BY b.vendor_id
     ORDER BY b.vendor_id`,
    params
  );

  const rows: VendorBalanceAggregationRow[] = r.rows.map((row) => ({
    vendorId: row.vendor_id,
    totalBills: Number(row.total_bills),
    totalPayments: Number(row.total_payments),
    outstandingBalance: Number(row.outstanding_balance),
  }));

  return {
    generatedAt: new Date().toISOString(),
    rows,
  };
}
