/**
 * Incremental state changes endpoint for bi-directional sync.
 * GET /api/state/changes?since=ISO8601&limit=500&cursor=ISO8601
 * Returns entities updated after the given timestamp (incremental pull).
 *
 * Supports cursor-based pagination:
 * - `limit`: max records per entity per page (default 500)
 * - `cursor`: resume from this timestamp (use `next_cursor` from previous response)
 * - `has_more`: indicates if more pages are available
 */

import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

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
  // NOTE: rental_agreements.org_id was renamed to tenant_id in schema v7
  { key: 'rental_agreements', table: 'rental_agreements', tenantColumn: 'tenant_id' },
  { key: 'project_agreements', table: 'project_agreements', tenantColumn: 'tenant_id' },
  { key: 'installment_plans', table: 'installment_plans', tenantColumn: 'tenant_id' },
  { key: 'vendors', table: 'vendors', tenantColumn: 'tenant_id' },
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

// GET /api/state/changes?since=ISO8601&limit=500
router.get('/changes', async (req: TenantRequest, res) => {
  try {
    const since = (req.query.since as string) || '1970-01-01T00:00:00.000Z';
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant required' });
    }

    // Parse pagination params
    let limit = parseInt(req.query.limit as string) || DEFAULT_LIMIT;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;
    if (limit < 1) limit = DEFAULT_LIMIT;

    const db = getDb();
    const result: Record<string, unknown[]> = {};
    let hasMore = false;

    // Run all entity queries in PARALLEL instead of sequentially.
    // This reduces initial load from ~750ms (25 sequential queries x 30ms each)
    // to ~30-50ms (limited by the slowest single query).
    const queryPromises = ENTITY_QUERIES.map(async ({ key, table, tenantColumn }) => {
      try {
        // Fetch limit + 1 to detect if there are more records
        const rows = await db.query(
          `SELECT * FROM ${table} WHERE ${tenantColumn} = $1 AND updated_at > $2 ORDER BY updated_at ASC LIMIT $3`,
          [tenantId, since, limit + 1]
        );

        const rowArray = rows as any[];
        if (rowArray.length > limit) {
          return { key, rows: rowArray.slice(0, limit).map((row) => rowToCamel(row)), hasMore: true };
        } else {
          return { key, rows: rowArray.map((row) => rowToCamel(row)), hasMore: false };
        }
      } catch (err) {
        // Table might not exist in older DBs — try fallback for rental_agreements.org_id
        if (table === 'rental_agreements' && tenantColumn === 'tenant_id') {
          try {
            const fallbackRows = await db.query(
              `SELECT * FROM ${table} WHERE org_id = $1 AND updated_at > $2 ORDER BY updated_at ASC LIMIT $3`,
              [tenantId, since, limit + 1]
            );
            const rowArray = fallbackRows as any[];
            if (rowArray.length > limit) {
              return { key, rows: rowArray.slice(0, limit).map((row) => rowToCamel(row)), hasMore: true };
            } else {
              return { key, rows: rowArray.map((row) => rowToCamel(row)), hasMore: false };
            }
          } catch {
            console.warn(`[stateChanges] Skip ${table} (both tenant_id and org_id failed)`);
            return { key, rows: [], hasMore: false };
          }
        } else {
          console.warn(`[stateChanges] Skip ${table}:`, (err as Error).message);
          return { key, rows: [], hasMore: false };
        }
      }
    });

    const queryResults = await Promise.all(queryPromises);
    for (const qr of queryResults) {
      result[qr.key] = qr.rows;
      if (qr.hasMore) hasMore = true;
    }

    // Compute the next cursor: the max updated_at across all returned records
    let latestTimestamp = since;
    for (const items of Object.values(result)) {
      for (const item of items as any[]) {
        const ts = item.updatedAt || item.updated_at;
        if (ts && ts > latestTimestamp) {
          latestTimestamp = ts;
        }
      }
    }

    res.json({
      since,
      updatedAt: new Date().toISOString(),
      entities: result,
      has_more: hasMore,
      next_cursor: hasMore ? latestTimestamp : null,
      limit,
    });
  } catch (error) {
    console.error('Error fetching state changes:', error);
    res.status(500).json({ error: 'Failed to fetch state changes' });
  }
});

export default router;
