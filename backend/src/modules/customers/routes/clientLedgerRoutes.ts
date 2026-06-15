import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { getPool } from '../../../db/pool.js';
import { getClientLedgerReportJson } from '../services/clientLedgerReportService.js';
import { memoryCacheGet, memoryCacheSet } from '../../../utils/memoryCache.js';

export const clientLedgerRouter = Router();

const TTL_MS = 120_000;

/** Server-side client (project owner) ledger report (LAN mode). */
clientLedgerRouter.get('/reports/client-ledger', async (req: AuthedRequest, res) => {
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

  const selectionKind = typeof req.query.selectionKind === 'string' ? req.query.selectionKind : 'all';
  const ownerId = typeof req.query.ownerId === 'string' ? req.query.ownerId : undefined;
  const unitId = typeof req.query.unitId === 'string' ? req.query.unitId : undefined;
  const sortKey = typeof req.query.sortKey === 'string' ? req.query.sortKey : undefined;
  const sortDirRaw = req.query.sortDirection === 'desc' ? 'desc' : 'asc';

  const cacheKey = `client_ledger:${tenantId}:${startDate}:${endDate}:${selectionKind}:${ownerId ?? ''}:${unitId ?? ''}:${sortKey ?? ''}:${sortDirRaw}`;
  const cached = memoryCacheGet<unknown>(cacheKey);
  if (cached) {
    sendSuccess(res, cached);
    return;
  }

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const payload = await getClientLedgerReportJson(client, tenantId, {
        startDate,
        endDate,
        selectionKind,
        ownerId,
        unitId,
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
