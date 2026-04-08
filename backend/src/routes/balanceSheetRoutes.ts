import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getBalanceSheetReportJson } from '../services/balanceSheetReportService.js';

export const balanceSheetRouter = Router();

/**
 * GET /api/reports/balance-sheet?date=YYYY-MM-DD&projectId=optional
 * Same calculation engine as the desktop Balance Sheet report (bundled from components/reports/balanceSheetEngine.ts).
 */
balanceSheetRouter.get('/reports/balance-sheet', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const dateRaw = req.query.date ?? req.query.asOf;
  const dateStr = typeof dateRaw === 'string' ? dateRaw.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    sendFailure(res, 400, 'BAD_REQUEST', 'Query parameter date (YYYY-MM-DD) is required.');
    return;
  }
  const projectRaw = req.query.projectId ?? req.query.project;
  const selectedProjectId =
    typeof projectRaw === 'string' && projectRaw.trim() ? projectRaw.trim() : 'all';

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const debug = req.query.debug === '1' || req.query.debug === 'true';
      const data = await getBalanceSheetReportJson(client, tenantId, dateStr, selectedProjectId, {
        includeDebug: debug,
      });
      sendSuccess(res, data);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});
