import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getPool } from '../db/pool.js';
import { getRentalBillsDashboardJson } from '../services/rentalBillsDashboardService.js';
import { memoryCacheGet, memoryCacheSet } from '../utils/memoryCache.js';

export const rentalBillsDashboardRouter = Router();

const TTL_MS = 60_000;

/** Server-side rental bills dashboard aggregation (LAN mode). */
rentalBillsDashboardRouter.get('/rental/bills-dashboard', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }

  const viewByRaw = typeof req.query.viewBy === 'string' ? req.query.viewBy : 'building';
  const validViewBy = new Set(['building', 'property', 'vendor', 'bearer']);
  const viewBy = validViewBy.has(viewByRaw)
    ? (viewByRaw as 'building' | 'property' | 'vendor' | 'bearer')
    : 'building';

  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  const search = typeof req.query.search === 'string' ? req.query.search : '';
  const tabRaw = typeof req.query.tab === 'string' ? req.query.tab : 'all';
  const tab =
    tabRaw === 'unpaid' || tabRaw === 'overdue' || tabRaw === 'all' ? tabRaw : 'all';
  const typeFilterRaw = typeof req.query.typeFilter === 'string' ? req.query.typeFilter : 'Bills';
  const typeFilter =
    typeFilterRaw === 'All' || typeFilterRaw === 'Bills' || typeFilterRaw === 'Payments'
      ? typeFilterRaw
      : 'Bills';
  const nodeId = typeof req.query.nodeId === 'string' ? req.query.nodeId : '';
  const sortKey = typeof req.query.sortKey === 'string' ? req.query.sortKey : 'date';
  const sortDir = req.query.sortDir === 'asc' ? 'asc' : 'desc';
  const pageRaw = typeof req.query.page === 'string' ? parseInt(req.query.page, 10) : 1;
  const pageSizeRaw = typeof req.query.pageSize === 'string' ? parseInt(req.query.pageSize, 10) : 20;
  const page = Number.isFinite(pageRaw) ? pageRaw : 1;
  const pageSize = Number.isFinite(pageSizeRaw) ? pageSizeRaw : 20;

  const cacheKey = `rental_bills_dash:${tenantId}:${viewBy}:${status}:${search}:${tab}:${typeFilter}:${nodeId}:${sortKey}:${sortDir}:${page}:${pageSize}`;
  const cached = memoryCacheGet<unknown>(cacheKey);
  if (cached) {
    sendSuccess(res, cached);
    return;
  }

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const payload = await getRentalBillsDashboardJson(client, tenantId, {
        viewBy,
        status,
        search,
        tab,
        typeFilter,
        nodeId: nodeId || undefined,
        sortKey,
        sortDir,
        page,
        pageSize,
      });
      memoryCacheSet(cacheKey, payload, TTL_MS);
      sendSuccess(res, payload);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});
