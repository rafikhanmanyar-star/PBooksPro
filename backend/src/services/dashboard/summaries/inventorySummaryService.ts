import type pg from 'pg';
import type { InventorySummaryResponse } from './types.js';

const UNIT_ON_ACTIVE_AGREEMENT_SQL = `
  EXISTS (
    SELECT 1 FROM project_agreement_units pau
    INNER JOIN project_agreements pa ON pa.id = pau.agreement_id AND pa.tenant_id = u.tenant_id
    WHERE pau.unit_id = u.id AND pa.deleted_at IS NULL AND pa.status <> 'Cancelled'
  )`;

export async function getInventorySummary(
  client: pg.PoolClient,
  tenantId: string
): Promise<InventorySummaryResponse> {
  const [counts, units, pendingPo] = await Promise.all([
    client.query<{
      projects: string;
      buildings: string;
      properties: string;
      units: string;
    }>(
      `SELECT
         (SELECT COUNT(*)::text FROM projects WHERE tenant_id = $1 AND deleted_at IS NULL) AS projects,
         (SELECT COUNT(*)::text FROM buildings WHERE tenant_id = $1 AND deleted_at IS NULL) AS buildings,
         (SELECT COUNT(*)::text FROM properties WHERE tenant_id = $1 AND deleted_at IS NULL) AS properties,
         (SELECT COUNT(*)::text FROM units WHERE tenant_id = $1 AND deleted_at IS NULL) AS units`,
      [tenantId]
    ),
    client.query<{ inventory_value: string; available_units: string; low_stock: string }>(
      `SELECT
         COALESCE(SUM(CASE WHEN u.status <> 'sold' THEN COALESCE(u.sale_price, 0) ELSE 0 END), 0)::text AS inventory_value,
         COUNT(*) FILTER (
           WHERE u.status = 'available' AND NOT ${UNIT_ON_ACTIVE_AGREEMENT_SQL}
         )::text AS available_units,
         COUNT(*) FILTER (
           WHERE u.status = 'available' AND NOT ${UNIT_ON_ACTIVE_AGREEMENT_SQL}
             AND COALESCE(u.sale_price, 0) <= 0
         )::text AS low_stock
       FROM units u
       WHERE u.tenant_id = $1 AND u.deleted_at IS NULL`,
      [tenantId]
    ),
    client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c
       FROM purchase_orders
       WHERE tenant_id = $1
         AND deleted_at IS NULL
         AND status IN ('Draft', 'Submitted', 'Approved', 'Partially Billed')`,
      [tenantId]
    ),
  ]);

  const c = counts.rows[0]!;
  const u = units.rows[0]!;
  const projectCount = Number(c.projects ?? 0);
  const buildingCount = Number(c.buildings ?? 0);
  const propertyCount = Number(c.properties ?? 0);
  const unitCount = Number(c.units ?? 0);

  return {
    generatedAt: new Date().toISOString(),
    projectCount,
    buildingCount,
    propertyCount,
    unitCount,
    totalItems: projectCount + buildingCount + propertyCount + unitCount,
    inventoryValue: Number(u.inventory_value ?? 0),
    availableUnits: Number(u.available_units ?? 0),
    lowStockItems: Number(u.low_stock ?? 0),
    pendingProcurement: Number(pendingPo.rows[0]?.c ?? 0),
  };
}
