import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { getPool } from '../../../db/pool.js';
import { getOwnerSecurityDepositReportJson } from '../services/ownerSecurityDepositReportService.js';
import { memoryCacheGet, memoryCacheSet } from '../../../utils/memoryCache.js';

export const ownerSecurityDepositRouter = Router();

const TTL_MS = 120_000;

ownerSecurityDepositRouter.get('/reports/owner-security-deposit', async (req: AuthedRequest, res) => {
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

  const buildingId = typeof req.query.buildingId === 'string' ? req.query.buildingId : 'all';
  const ownerId = typeof req.query.ownerId === 'string' ? req.query.ownerId : 'all';
  const propertyId = typeof req.query.propertyId === 'string' ? req.query.propertyId : 'all';
  const search = typeof req.query.search === 'string' ? req.query.search : '';
  const sortKey = typeof req.query.sortKey === 'string' ? req.query.sortKey : 'date';
  const sortDirection = req.query.sortDirection === 'desc' ? 'desc' : 'asc';

  const cacheKey = `owner_security_deposit:${tenantId}:${startDate}:${endDate}:${buildingId}:${ownerId}:${propertyId}:${search}:${sortKey}:${sortDirection}`;
  const cached = memoryCacheGet<unknown>(cacheKey);
  if (cached) {
    sendSuccess(res, cached);
    return;
  }

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const payload = await getOwnerSecurityDepositReportJson(client, tenantId, {
        startDate,
        endDate,
        buildingId,
        ownerId,
        propertyId,
        search,
        sortKey,
        sortDirection,
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
