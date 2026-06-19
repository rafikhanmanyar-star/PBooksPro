import type pg from 'pg';
import { GLOBAL_SYSTEM_TENANT_ID } from '../../constants/globalSystemChart.js';
import type {
  OwnerBalanceAggregationRow,
  OwnerBalancesAggregationResponse,
} from './types.js';

export type OwnerBalanceAggregationFilters = {
  ownerId?: string;
  buildingId?: string;
  propertyId?: string;
};

export async function getOwnerBalancesAggregation(
  client: pg.PoolClient,
  tenantId: string,
  filters: OwnerBalanceAggregationFilters = {}
): Promise<OwnerBalancesAggregationResponse> {
  const params: unknown[] = [tenantId, GLOBAL_SYSTEM_TENANT_ID];
  const extra: string[] = [];

  if (filters.ownerId) {
    params.push(filters.ownerId);
    extra.push(`AND t.owner_id = $${params.length}`);
  }
  if (filters.propertyId) {
    params.push(filters.propertyId);
    extra.push(`AND t.property_id = $${params.length}`);
  }
  if (filters.buildingId) {
    params.push(filters.buildingId);
    extra.push(
      `AND t.property_id IN (SELECT p.id FROM properties p WHERE p.tenant_id = $1 AND p.deleted_at IS NULL AND p.building_id = $${params.length})`
    );
  }

  const extraSql = extra.join(' ');

  const r = await client.query<{
    owner_id: string;
    total_collected: string;
    total_settled: string;
    outstanding_balance: string;
    service_charges: string;
  }>(
    `WITH owner_tx AS (
       SELECT
         t.owner_id,
         COALESCE(SUM(CASE WHEN t.type = 'Income' THEN t.amount ELSE 0 END), 0) AS total_collected,
         COALESCE(SUM(CASE WHEN t.type = 'Expense' THEN t.amount ELSE 0 END), 0) AS total_settled
       FROM transactions t
       WHERE t.tenant_id = $1
         AND t.deleted_at IS NULL
         AND t.owner_id IS NOT NULL
         AND TRIM(t.owner_id) <> ''
         AND t.property_id IS NOT NULL
         AND TRIM(t.property_id) <> ''
         ${extraSql}
       GROUP BY t.owner_id
     ),
     svc AS (
       SELECT t.owner_id, COALESCE(SUM(t.amount), 0) AS service_charges
       FROM transactions t
       INNER JOIN categories c ON c.id = t.category_id
         AND (c.tenant_id = $1 OR c.tenant_id = $2)
         AND c.deleted_at IS NULL
       WHERE t.tenant_id = $1
         AND t.deleted_at IS NULL
         AND t.type = 'Income'
         AND c.name = 'Owner Service Charge Payment'
         AND t.owner_id IS NOT NULL
         AND TRIM(t.owner_id) <> ''
         ${extraSql}
       GROUP BY t.owner_id
     )
     SELECT
       o.owner_id,
       o.total_collected::text,
       o.total_settled::text,
       (o.total_collected - o.total_settled)::text AS outstanding_balance,
       COALESCE(s.service_charges, 0)::text AS service_charges
     FROM owner_tx o
     LEFT JOIN svc s ON s.owner_id = o.owner_id
     ORDER BY o.owner_id`,
    params
  );

  const rows: OwnerBalanceAggregationRow[] = r.rows.map((row) => {
    const outstandingBalance = Number(row.outstanding_balance);
    return {
      ownerId: row.owner_id,
      totalCollected: Number(row.total_collected),
      totalSettled: Number(row.total_settled),
      outstandingBalance,
      serviceCharges: Number(row.service_charges),
      netPayable: Math.max(0, outstandingBalance),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    rows,
  };
}
