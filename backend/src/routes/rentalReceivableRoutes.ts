import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getPool } from '../db/pool.js';
import { getRentalReceivableReportJson } from '../services/rentalReceivableReportService.js';
import { memoryCacheGet, memoryCacheSet } from '../utils/memoryCache.js';

export const rentalReceivableRouter = Router();

const TTL_MS = 120_000;

/** Server-side rental receivable report (LAN mode). */
rentalReceivableRouter.get('/reports/rental-receivable', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }

  const buildingId = typeof req.query.buildingId === 'string' ? req.query.buildingId : 'all';

  const cacheKey = `rental_receivable:${tenantId}:${buildingId}`;
  const cached = memoryCacheGet<unknown>(cacheKey);
  if (cached) {
    sendSuccess(res, cached);
    return;
  }

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const payload = await getRentalReceivableReportJson(client, tenantId, { buildingId });
      memoryCacheSet(cacheKey, payload, TTL_MS);
      sendSuccess(res, payload);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});
