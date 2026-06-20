import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../../../db/pool.js';
import { getStateChanges } from '../services/stateChangesService.js';
import { getBulkAppState, getBulkAppStateChunked } from '../services/appStateBulkService.js';

export const stateRouter = Router();

/**
 * Full snapshot for one round-trip (same data as the client’s parallel GETs in loadState()).
 * Optional query: `?entities=accounts,contacts,projects` (camelCase or snake_case, comma-separated).
 */
stateRouter.get('/state/bulk', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    // PERF-A6.5: release connection before JSON serialization.
    // getBulkAppState completes all DB queries then returns; the connection
    // is no longer needed during sendSuccess's JSON.stringify + res.write.
    let payload: Awaited<ReturnType<typeof getBulkAppState>>;
    try {
      payload = await getBulkAppState(client, tenantId, req.query.entities, req.role, req.userId);
    } finally {
      client.release();
    }
    sendSuccess(res, payload);
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /state/bulk' });
  }
});

/** Chunked bulk load for large tenants (primarily paginates transactions). */
stateRouter.get('/state/bulk-chunked', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    // PERF-A6.5: release connection before JSON serialization.
    // All DB work completes inside getBulkAppStateChunked; the connection
    // is not needed during sendSuccess's JSON.stringify + res.write.
    let payload: Awaited<ReturnType<typeof getBulkAppStateChunked>>;
    try {
      payload = await getBulkAppStateChunked(
        client,
        tenantId,
        req.query.limit,
        req.query.offset,
        req.role,
        req.userId
      );
    } finally {
      client.release();
    }
    sendSuccess(res, payload);
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /state/bulk-chunked' });
  }
});

/** Incremental sync: vendors, contacts, … + Architecture v2 `changeLog` feed when present. */
stateRouter.get('/state/changes', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const sinceRaw = typeof req.query.since === 'string' ? req.query.since : '';
  try {
    const payload = await withTransaction((c) => getStateChanges(c, tenantId, sinceRaw, req.role, req.userId));
    sendSuccess(res, payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});
