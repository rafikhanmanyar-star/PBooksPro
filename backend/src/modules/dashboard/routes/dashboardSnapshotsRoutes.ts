import { Router } from 'express';
import { getPool } from '../../../db/pool.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { listSnapshotsForDate } from '../services/DashboardSnapshotService.js';

export const dashboardSnapshotsRouter = Router();

/**
 * GET /dashboard/snapshots?date=YYYY-MM-DD
 * Pre-calculated KPI snapshots (Architecture v2 analytics_snapshots).
 */
dashboardSnapshotsRouter.get('/dashboard/snapshots', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }

  const dateRaw = typeof req.query.date === 'string' ? req.query.date.trim() : '';
  const snapshotDate = dateRaw || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
    sendFailure(res, 400, 'BAD_REQUEST', 'Invalid date. Use YYYY-MM-DD.');
    return;
  }

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const data = await listSnapshotsForDate(client, tenantId, snapshotDate);
      sendSuccess(res, data);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /dashboard/snapshots' });
  }
});
