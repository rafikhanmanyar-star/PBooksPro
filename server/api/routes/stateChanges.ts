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
import { cacheMiddleware } from '../../middleware/cacheMiddleware.js';

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

// Full bulk load: response keys match client AppState (camelCase). Used by GET /api/state/bulk.
const BULK_ENTITIES: { responseKey: string; table: string; tenantColumn: string }[] = [
  { responseKey: 'accounts', table: 'accounts', tenantColumn: 'tenant_id' },
  { responseKey: 'contacts', table: 'contacts', tenantColumn: 'tenant_id' },
  { responseKey: 'categories', table: 'categories', tenantColumn: 'tenant_id' },
  { responseKey: 'projects', table: 'projects', tenantColumn: 'tenant_id' },
  { responseKey: 'buildings', table: 'buildings', tenantColumn: 'tenant_id' },
  { responseKey: 'properties', table: 'properties', tenantColumn: 'tenant_id' },
  { responseKey: 'units', table: 'units', tenantColumn: 'tenant_id' },
  { responseKey: 'transactions', table: 'transactions', tenantColumn: 'tenant_id' },
  { responseKey: 'invoices', table: 'invoices', tenantColumn: 'tenant_id' },
  { responseKey: 'bills', table: 'bills', tenantColumn: 'tenant_id' },
  { responseKey: 'budgets', table: 'budgets', tenantColumn: 'tenant_id' },
  { responseKey: 'planAmenities', table: 'plan_amenities', tenantColumn: 'tenant_id' },
  { responseKey: 'installmentPlans', table: 'installment_plans', tenantColumn: 'tenant_id' },
  { responseKey: 'rentalAgreements', table: 'rental_agreements', tenantColumn: 'tenant_id' },
  { responseKey: 'projectAgreements', table: 'project_agreements', tenantColumn: 'tenant_id' },
  { responseKey: 'contracts', table: 'contracts', tenantColumn: 'tenant_id' },
  { responseKey: 'salesReturns', table: 'sales_returns', tenantColumn: 'tenant_id' },
  { responseKey: 'quotations', table: 'quotations', tenantColumn: 'tenant_id' },
  { responseKey: 'documents', table: 'documents', tenantColumn: 'tenant_id' },
  { responseKey: 'recurringInvoiceTemplates', table: 'recurring_invoice_templates', tenantColumn: 'tenant_id' },
  { responseKey: 'pmCycleAllocations', table: 'pm_cycle_allocations', tenantColumn: 'tenant_id' },
  { responseKey: 'vendors', table: 'vendors', tenantColumn: 'tenant_id' },
];

// Critical subset for first paint (accounts, contacts, categories, projects, buildings, properties, units)
const CRITICAL_ENTITIES = BULK_ENTITIES.filter(
  (e) =>
    ['accounts', 'contacts', 'categories', 'projects', 'buildings', 'properties', 'units'].indexOf(e.responseKey) >= 0
);

// Tables with heavy JSONB/text columns that should be excluded from bulk/sync payloads.
// These columns are only needed when viewing individual records, not for list/sync operations.
const HEAVY_COLUMN_EXCLUSIONS: Record<string, string[]> = {
  documents: ['file_data'],
  bills: ['expense_category_items'],
  contracts: ['expense_category_items'],
  quotations: ['items'],
  payroll_employees: ['salary', 'adjustments', 'projects'],
};

/** Build SELECT clause excluding heavy columns for a table. Falls back to * if no exclusions. */
function selectColumnsFor(table: string): string {
  const exclusions = HEAVY_COLUMN_EXCLUSIONS[table];
  if (!exclusions || exclusions.length === 0) return '*';
  const excludeSet = new Set(exclusions);
  // We can't dynamically introspect columns at runtime without a schema query,
  // so for tables with exclusions we just exclude with a sub-select pattern.
  // The approach: use * but strip heavy columns via JSON in rowToCamel.
  // Actually the safest approach for PostgreSQL is to just return * and strip in JS.
  return '*';
}

/** Remove heavy columns from a row object before sending to client */
function stripHeavyColumns(row: Record<string, unknown>, table: string): Record<string, unknown> {
  const exclusions = HEAVY_COLUMN_EXCLUSIONS[table];
  if (!exclusions) return row;
  const result = { ...row };
  for (const col of exclusions) {
    delete result[col];
    delete result[snakeToCamel(col)];
  }
  return result;
}

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
    const stripHeavy = req.query.full !== 'true';
    const queryPromises = ENTITY_QUERIES.map(async ({ key, table, tenantColumn }) => {
      try {
        const rows = await db.query(
          `SELECT * FROM ${table} WHERE ${tenantColumn} = $1 AND updated_at > $2 ORDER BY updated_at ASC LIMIT $3`,
          [tenantId, since, limit + 1]
        );

        const rowArray = rows as any[];
        const transform = (row: any) => {
          const camel = rowToCamel(row);
          return stripHeavy ? stripHeavyColumns(camel, table) : camel;
        };
        if (rowArray.length > limit) {
          return { key, rows: rowArray.slice(0, limit).map(transform), hasMore: true };
        } else {
          return { key, rows: rowArray.map(transform), hasMore: false };
        }
      } catch (err) {
        if (table === 'rental_agreements' && tenantColumn === 'tenant_id') {
          try {
            const fallbackRows = await db.query(
              `SELECT * FROM ${table} WHERE org_id = $1 AND updated_at > $2 ORDER BY updated_at ASC LIMIT $3`,
              [tenantId, since, limit + 1]
            );
            const rowArray = fallbackRows as any[];
            const transform = (row: any) => {
              const camel = rowToCamel(row);
              return stripHeavy ? stripHeavyColumns(camel, table) : camel;
            };
            if (rowArray.length > limit) {
              return { key, rows: rowArray.slice(0, limit).map(transform), hasMore: true };
            } else {
              return { key, rows: rowArray.map(transform), hasMore: false };
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

/** Check if error is due to missing column (e.g. deleted_at not yet migrated) */
function isMissingColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /column ["']?\w+["']? does not exist/i.test(msg) || /no such column/i.test(msg);
}

async function fetchTable(
  db: ReturnType<typeof getDb>,
  tenantId: string,
  table: string,
  tenantColumn: string,
  excludeHeavy: boolean = true
): Promise<Record<string, unknown>[]> {
  try {
    const rows = await db.query(
      `SELECT * FROM ${table} WHERE ${tenantColumn} = $1 AND deleted_at IS NULL`,
      [tenantId]
    );
    return (rows as any[]).map((row) => {
      const camel = rowToCamel(row);
      return excludeHeavy ? stripHeavyColumns(camel, table) : camel;
    });
  } catch (err) {
    // Fallback: tables may lack deleted_at if sync metadata migration not yet applied
    if (isMissingColumnError(err)) {
      try {
        const rows = await db.query(`SELECT * FROM ${table} WHERE ${tenantColumn} = $1`, [tenantId]);
        return (rows as any[]).map((row) => rowToCamel(row));
      } catch (fallbackErr) {
        console.warn(`[state/bulk] Skip ${table} (no deleted_at and base query failed):`, (fallbackErr as Error).message);
        return [];
      }
    }
    if (table === 'rental_agreements' && tenantColumn === 'tenant_id') {
      try {
        const fallbackRows = await db.query(
          `SELECT * FROM ${table} WHERE org_id = $1`,
          [tenantId]
        );
        return (fallbackRows as any[]).map((row) => rowToCamel(row));
      } catch {
        console.warn(`[state/bulk] Skip ${table} (both tenant_id and org_id failed)`);
        return [];
      }
    }
    if (table === 'transaction_audit_log') {
      console.warn(`[state/bulk] Skip ${table}:`, (err as Error).message);
      return [];
    }
    console.warn(`[state/bulk] Skip ${table}:`, (err as Error).message);
    return [];
  }
}

// GET /api/state/bulk — full state in one response (reduces round-trips vs 22 separate GETs)
// Cache for 2 minutes per tenant to reduce database load
router.get('/bulk', cacheMiddleware(120, (req) => `__bulk__${(req as TenantRequest).tenantId}`), async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    console.log('[DIAG-SERVER] /state/bulk called, tenantId=', tenantId, 'entities=', req.query.entities);
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant required' });
    }

    const db = getDb();
    const result: Record<string, unknown[]> = {};

    // Support entity filtering for progressive loading
    const entitiesParam = req.query.entities as string | undefined;
    const requestedEntities = entitiesParam
      ? new Set(entitiesParam.split(',').map(e => e.trim()))
      : null;

    const entitiesToLoad = requestedEntities
      ? BULK_ENTITIES.filter(e => requestedEntities.has(e.responseKey))
      : BULK_ENTITIES;

    const bulkPromises = entitiesToLoad.map(async ({ responseKey, table, tenantColumn }) => {
      const rows = await fetchTable(db, tenantId, table, tenantColumn);
      return { responseKey, rows };
    });

    // Only load transaction log if not filtering or if explicitly requested
    const shouldLoadTransactionLog = !requestedEntities || requestedEntities.has('transactionLog');
    const transactionLogPromise = shouldLoadTransactionLog
      ? fetchTable(db, tenantId, 'transaction_audit_log', 'tenant_id')
      : Promise.resolve([]);

    const [bulkResults, transactionLog] = await Promise.all([
      Promise.all(bulkPromises),
      transactionLogPromise,
    ]);

    for (const { responseKey, rows } of bulkResults) {
      result[responseKey] = rows;
    }
    if (shouldLoadTransactionLog) {
      result.transactionLog = transactionLog;
    }

    const counts: Record<string, number> = {};
    for (const [key, arr] of Object.entries(result)) {
      counts[key] = Array.isArray(arr) ? arr.length : 0;
    }
    console.log('[DIAG-SERVER] /state/bulk response:', JSON.stringify(counts));

    res.json(result);
  } catch (error) {
    console.error('[DIAG-SERVER] /state/bulk ERROR:', error);
    res.status(500).json({ error: 'Failed to fetch state' });
  }
});

// GET /api/state/bulk-chunked — paginated bulk state for progressive loading
// Params: limit (records per page, default 100), offset (skip N records, default 0)
// Returns: { entities: {...}, totals: {...}, has_more: boolean, next_offset: number }
router.get('/bulk-chunked', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant required' });
    }

    const db = getDb();
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500); // Max 500 per request
    const offset = parseInt(req.query.offset as string) || 0;

    const result: Record<string, unknown[]> = {};
    const totals: Record<string, number> = {};
    let hasMore = false;

    // Fetch each entity with LIMIT and OFFSET
    const promises = BULK_ENTITIES.map(async ({ responseKey, table, tenantColumn }) => {
      const runQuery = async (useDeletedAt: boolean) => {
        const countWhere = useDeletedAt
          ? `${tenantColumn} = $1 AND deleted_at IS NULL`
          : `${tenantColumn} = $1`;
        const countResult = await db.query(
          `SELECT COUNT(*) as count FROM ${table} WHERE ${countWhere}`,
          [tenantId]
        );
        const total = parseInt((countResult as any[])[0]?.count || '0');

        const rowWhere = useDeletedAt
          ? `${tenantColumn} = $1 AND deleted_at IS NULL`
          : `${tenantColumn} = $1`;
        const rows = await db.query(
          `SELECT * FROM ${table} WHERE ${rowWhere} ORDER BY id LIMIT $2 OFFSET $3`,
          [tenantId, limit, offset]
        );
        return { rows: (rows as any[]).map(row => rowToCamel(row)), total };
      };

      try {
        const { rows: camelRows, total } = await runQuery(true);
        const entityHasMore = offset + camelRows.length < total;
        if (entityHasMore) hasMore = true;
        return { responseKey, rows: camelRows, total };
      } catch (err) {
        // Fallback when deleted_at column does not exist (migration not applied)
        if (isMissingColumnError(err)) {
          try {
            const { rows: camelRows, total } = await runQuery(false);
            const entityHasMore = offset + camelRows.length < total;
            if (entityHasMore) hasMore = true;
            return { responseKey, rows: camelRows, total };
          } catch (fallbackErr) {
            console.warn(`[bulk-chunked] Skip ${table}:`, (fallbackErr as Error).message);
            return { responseKey, rows: [], total: 0 };
          }
        }
        // Fallback for rental_agreements with org_id
        if (table === 'rental_agreements' && tenantColumn === 'tenant_id') {
          try {
            const countResult = await db.query(
              `SELECT COUNT(*) as count FROM ${table} WHERE org_id = $1`,
              [tenantId]
            );
            const total = parseInt((countResult as any[])[0]?.count || '0');

            const fallbackRows = await db.query(
              `SELECT * FROM ${table} WHERE org_id = $1 ORDER BY id LIMIT $2 OFFSET $3`,
              [tenantId, limit, offset]
            );
            const camelRows = (fallbackRows as any[]).map(row => rowToCamel(row));

            const entityHasMore = offset + camelRows.length < total;
            if (entityHasMore) hasMore = true;

            return { responseKey, rows: camelRows, total };
          } catch {
            console.warn(`[bulk-chunked] Skip ${table} (both tenant_id and org_id failed)`);
            return { responseKey, rows: [], total: 0 };
          }
        }
        console.warn(`[bulk-chunked] Skip ${table}:`, (err as Error).message);
        return { responseKey, rows: [], total: 0 };
      }
    });

    const results = await Promise.all(promises);

    for (const { responseKey, rows, total } of results) {
      result[responseKey] = rows;
      totals[responseKey] = total;
    }

    res.json({
      entities: result,
      totals,
      has_more: hasMore,
      next_offset: hasMore ? offset + limit : null,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching state bulk-chunked:', error);
    res.status(500).json({ error: 'Failed to fetch state' });
  }
});

// GET /api/state/critical — minimal state for first paint (then load full in background)
router.get('/critical', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant required' });
    }

    const db = getDb();
    const result: Record<string, unknown[]> = {};

    const promises = CRITICAL_ENTITIES.map(async ({ responseKey, table, tenantColumn }) => {
      const rows = await fetchTable(db, tenantId, table, tenantColumn);
      return { responseKey, rows };
    });

    const results = await Promise.all(promises);
    for (const { responseKey, rows } of results) {
      result[responseKey] = rows;
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching state critical:', error);
    res.status(500).json({ error: 'Failed to fetch state' });
  }
});

// GET /api/state/diag — Diagnostic: shows tenant ID and record counts per table
router.get('/diag', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant required' });
    }

    const db = getDb();
    const counts: Record<string, number> = {};

    for (const { responseKey, table, tenantColumn } of BULK_ENTITIES) {
      try {
        const result = await db.query(
          `SELECT COUNT(*) as count FROM ${table} WHERE ${tenantColumn} = $1`,
          [tenantId]
        );
        counts[responseKey] = parseInt((result as any[])[0]?.count || '0');
      } catch (err) {
        counts[responseKey] = -1; // indicates query failure
      }
    }

    res.json({
      tenantId,
      counts,
      totalRecords: Object.values(counts).filter(c => c >= 0).reduce((a, b) => a + b, 0),
    });
  } catch (error) {
    console.error('Error in state diag:', error);
    res.status(500).json({ error: 'Diag failed', message: (error as Error).message });
  }
});

export default router;
