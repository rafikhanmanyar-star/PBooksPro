import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { getPool } from '../../../db/pool.js';
import { getVendorLedgerReportJson } from '../services/vendorLedgerReportService.js';
import { memoryCacheGet, memoryCacheSet } from '../../../utils/memoryCache.js';

export const vendorLedgerRouter = Router();

const TTL_MS = 120_000;

/** Server-side vendor ledger report (LAN mode). */
vendorLedgerRouter.get('/reports/vendor-ledger', async (req: AuthedRequest, res) => {
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

  const vendorId = typeof req.query.vendorId === 'string' ? req.query.vendorId : 'all';
  const buildingId = typeof req.query.buildingId === 'string' ? req.query.buildingId : 'all';
  const search = typeof req.query.search === 'string' ? req.query.search : '';
  const context = typeof req.query.context === 'string' ? req.query.context : undefined;
  const sortDirRaw = req.query.sortDirection === 'desc' ? 'desc' : 'asc';

  const cacheKey = `vendor_ledger:${tenantId}:${startDate}:${endDate}:${vendorId}:${buildingId}:${search}:${context ?? ''}:${sortDirRaw}`;
  const cached = memoryCacheGet<unknown>(cacheKey);
  if (cached) {
    sendSuccess(res, cached);
    return;
  }

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const payload = await getVendorLedgerReportJson(client, tenantId, {
        startDate,
        endDate,
        vendorId,
        buildingId,
        search,
        context,
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
