import { Router } from 'express';
import type { Response } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { getPool, withTransaction, isPoolSaturated, getPoolPressure } from '../../../db/pool.js';
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
  if (shedIfPoolSaturated(res, 'GET /state/bulk-chunked')) return;
  try {
    const pool = getPool();

    // PERF-A6.5A: pool pressure probe — emitted to stderr so it appears even
    // when stdout is buffered or filtered. Shows whether time is spent waiting
    // for a connection (POOL_WAIT → POOL_ACQUIRED gap) vs inside the handler.
    console.error(
      `[POOL_WAIT] before connect offset=${req.query.offset ?? 0} total=${pool.totalCount} idle=${pool.idleCount} waiting=${pool.waitingCount}`
    );
    const _connectStart = Date.now();
    const client = await pool.connect();
    console.error(
      `[POOL_ACQUIRED] waitMs=${Date.now() - _connectStart} offset=${req.query.offset ?? 0} total=${pool.totalCount} idle=${pool.idleCount} waiting=${pool.waitingCount}`
    );

    // PERF-A6.5: release connection before JSON serialization.
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
