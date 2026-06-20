import { Router } from 'express';
import type { Response } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { withTransaction, isPoolSaturated, getPoolPressure } from '../../../db/pool.js';
import { getStateChanges } from '../services/stateChangesService.js';
import { getBulkAppState, getBulkAppStateChunked } from '../services/appStateBulkService.js';

export const stateRouter = Router();

/** Retry-After (seconds) advertised when a heavy read endpoint sheds load. */
const POOL_SHED_RETRY_AFTER_SECONDS = 5;

/**
 * Fast-fail heavy read endpoints when the DB pool is saturated, instead of queueing
 * a connection until the gateway times out (524). Returns true (and writes a 503) when
 * the request was shed; the caller should then return without touching the pool.
 */
function shedIfPoolSaturated(res: Response, route: string): boolean {
  if (!isPoolSaturated()) return false;
  const p = getPoolPressure();
  console.warn(
    `[POOL_SHED] 🟠 route=${route} → 503 (idle=${p.idle} waiting=${p.waiting} total=${p.total})`
  );
  res.setHeader('Retry-After', String(POOL_SHED_RETRY_AFTER_SECONDS));
  sendFailure(
    res,
    503,
    'POOL_SATURATED',
    'Server is busy handling other requests. Please retry shortly.'
  );
  return true;
}

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
  if (shedIfPoolSaturated(res, 'GET /state/bulk')) return;
  try {
    const payload = await getBulkAppState(tenantId, req.query.entities, req.role, req.userId);
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
  if (shedIfPoolSaturated(res, 'GET /state/bulk-chunked')) return;
  try {
    const payload = await getBulkAppStateChunked(
      tenantId,
      req.query.limit,
      req.query.offset,
      req.role,
      req.userId
    );
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
