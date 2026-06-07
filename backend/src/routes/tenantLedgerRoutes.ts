import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getPool } from '../db/pool.js';
import { getTenantLedgerReportJson } from '../services/tenantLedgerReportService.js';
import { memoryCacheGet, memoryCacheSet } from '../utils/memoryCache.js';

export const tenantLedgerRouter = Router();

const TTL_MS = 120_000;

/** Server-side tenant ledger report (LAN mode). */
tenantLedgerRouter.get('/reports/tenant-ledger', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }

  const startDate = typeof req.query.startDate === 'string' ? req.query.startDate.slice(0, 10) : '';
  const endDate = typeof req.query.endDate === 'string' ? req.query.endDate.slice(0, 10) : '';
  if (!startDate || !endDate) {
    sendFailure(res, 400, 'BAD_REQUEST', 'Query startDate and endDate (YYYY-MM-DD) are required.');
    return;
  }

  const tenantFilter = typeof req.query.tenantId === 'string' ? req.query.tenantId : 'all';
  const search = typeof req.query.search === 'string' ? req.query.search : '';
  const groupBy = typeof req.query.groupBy === 'string' ? req.query.groupBy : '';
  const sortKey = typeof req.query.sortKey === 'string' ? req.query.sortKey : undefined;
  const sortDirRaw = req.query.sortDirection === 'desc' ? 'desc' : 'asc';

  const cacheKey = `tenant_ledger:${tenantId}:${startDate}:${endDate}:${tenantFilter}:${search}:${groupBy}:${sortKey}:${sortDirRaw}`;
  const cached = memoryCacheGet<unknown>(cacheKey);
  if (cached) {
    sendSuccess(res, cached);
    return;
  }

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const payload = await getTenantLedgerReportJson(client, tenantId, {
        startDate,
        endDate,
        tenantId: tenantFilter,
        search,
        groupBy,
        sortKey,
        sortDirection: sortDirRaw,
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
