/**
 * Incremental state changes endpoint for bi-directional sync.
 * GET /api/state/changes?since=ISO8601
 * Returns entities updated after the given timestamp (incremental pull).
 */

import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();

// Tables we support for incremental sync (tenant_id column, updated_at column)
const ENTITY_QUERIES: { key: string; table: string; tenantColumn: string }[] = [
  { key: 'accounts', table: 'accounts', tenantColumn: 'tenant_id' },
  { key: 'contacts', table: 'contacts', tenantColumn: 'tenant_id' },
  { key: 'categories', table: 'categories', tenantColumn: 'tenant_id' },
  { key: 'projects', table: 'projects', tenantColumn: 'tenant_id' },
  { key: 'buildings', table: 'buildings', tenantColumn: 'tenant_id' },
  { key: 'properties', table: 'properties', tenantColumn: 'tenant_id' },
  { key: 'units', table: 'units', tenantColumn: 'tenant_id' },
  { key: 'transactions', table: 'transactions', tenantColumn: 'tenant_id' },
  { key: 'invoices', table: 'invoices', tenantColumn: 'tenant_id' },
  { key: 'bills', table: 'bills', tenantColumn: 'tenant_id' },
  { key: 'budgets', table: 'budgets', tenantColumn: 'tenant_id' },
  { key: 'plan_amenities', table: 'plan_amenities', tenantColumn: 'tenant_id' },
  { key: 'inventory_items', table: 'inventory_items', tenantColumn: 'tenant_id' },
  { key: 'warehouses', table: 'warehouses', tenantColumn: 'tenant_id' },
  { key: 'contracts', table: 'contracts', tenantColumn: 'tenant_id' },
  { key: 'sales_returns', table: 'sales_returns', tenantColumn: 'tenant_id' },
  { key: 'quotations', table: 'quotations', tenantColumn: 'tenant_id' },
  { key: 'documents', table: 'documents', tenantColumn: 'tenant_id' },
  { key: 'recurring_invoice_templates', table: 'recurring_invoice_templates', tenantColumn: 'tenant_id' },
  { key: 'pm_cycle_allocations', table: 'pm_cycle_allocations', tenantColumn: 'tenant_id' },
  { key: 'rental_agreements', table: 'rental_agreements', tenantColumn: 'org_id' },
  { key: 'project_agreements', table: 'project_agreements', tenantColumn: 'tenant_id' },
  { key: 'installment_plans', table: 'installment_plans', tenantColumn: 'tenant_id' },
];

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function rowToCamel(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[snakeToCamel(k)] = v;
  }
  return out;
}

// GET /api/state/changes?since=ISO8601
router.get('/changes', async (req: TenantRequest, res) => {
  try {
    const since = (req.query.since as string) || '1970-01-01T00:00:00.000Z';
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant required' });
    }

    const db = getDb();
    const result: Record<string, unknown[]> = {};

    for (const { key, table, tenantColumn } of ENTITY_QUERIES) {
      try {
        const rows = await db.query(
          `SELECT * FROM ${table} WHERE ${tenantColumn} = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
          [tenantId, since]
        );
        result[key] = (rows as any[]).map((row) => rowToCamel(row));
      } catch (err) {
        // Table might not exist in older DBs
        console.warn(`[stateChanges] Skip ${table}:`, (err as Error).message);
        result[key] = [];
      }
    }

    res.json({
      since,
      updatedAt: new Date().toISOString(),
      entities: result,
    });
  } catch (error) {
    console.error('Error fetching state changes:', error);
    res.status(500).json({ error: 'Failed to fetch state changes' });
  }
});

export default router;
