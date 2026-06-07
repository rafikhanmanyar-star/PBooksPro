import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getFinancialReconciliationCertification } from '../services/financialReconciliationService.js';

export const financialReconciliationRouter = Router();

/**
 * GET /api/reports/reconciliation/certification?from=&to=&projectId=
 * Full financial reconciliation certification: TB, GL, P&L, BS cross-checks + missing journals.
 */
financialReconciliationRouter.get('/reports/reconciliation/certification', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }

  const fromRaw = req.query.from ?? req.query.fromDate;
  const toRaw = req.query.to ?? req.query.toDate;
  const from = typeof fromRaw === 'string' ? fromRaw.trim() : '';
  const to = typeof toRaw === 'string' ? toRaw.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    sendFailure(res, 400, 'BAD_REQUEST', 'Query parameters from and to (YYYY-MM-DD) are required.');
    return;
  }

  const projectId =
    typeof req.query.projectId === 'string' && req.query.projectId.trim()
      ? req.query.projectId.trim()
      : 'all';

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const certification = await getFinancialReconciliationCertification(client, tenantId, {
        from,
        to,
        projectId,
      });
      sendSuccess(res, certification);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /reports/reconciliation/certification' });
  }
});

/**
 * GET /api/reports/reconciliation/sources
 * Static audit of financial report data sources (no DB required).
 */
financialReconciliationRouter.get('/reports/reconciliation/sources', async (_req, res) => {
  const { getFinancialReportSourceRegistry } = await import('../financial/financialReconciliationEngine.js');
  sendSuccess(res, { items: getFinancialReportSourceRegistry() });
});
