import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getCashFlowReportJson } from '../services/cashFlowReportService.js';

export const cashFlowRouter = Router();

/**
 * GET /api/reports/cash-flow?from=YYYY-MM-DD&to=YYYY-MM-DD&projectId=optional
 * IAS 7 direct method; reconciles to balance sheet cash.
 */
cashFlowRouter.get('/reports/cash-flow', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const fromRaw = req.query.from ?? req.query.startDate;
  const toRaw = req.query.to ?? req.query.endDate;
  const from = typeof fromRaw === 'string' ? fromRaw.trim() : '';
  const to = typeof toRaw === 'string' ? toRaw.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    sendFailure(res, 400, 'BAD_REQUEST', 'Query parameters from and to (YYYY-MM-DD) are required.');
    return;
  }
  const projectRaw = req.query.projectId ?? req.query.project;
  const selectedProjectId =
    typeof projectRaw === 'string' && projectRaw.trim() ? projectRaw.trim() : 'all';

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const data = await getCashFlowReportJson(client, tenantId, from, to, selectedProjectId);
      sendSuccess(res, data);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});
