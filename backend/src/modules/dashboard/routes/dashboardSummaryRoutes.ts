import { Router } from 'express';
import { getPool } from '../../../db/pool.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import {
  isValidDateOnly,
  parseDashboardFilters,
} from '../../../services/dashboard/dashboardMetricsHelpers.js';
import {
  getFinancialSummary,
  getInventorySummary,
  getProcurementSummary,
  getProjectAgreementSummary,
  getRentalSummary,
  parseProjectSummaryFilters,
} from '../../../services/dashboard/summaries/index.js';

export const dashboardSummaryRouter = Router();

dashboardSummaryRouter.get('/dashboard/summaries/financial', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const filters = parseDashboardFilters(req.query as Record<string, unknown>);
  if (!isValidDateOnly(filters.from) || !isValidDateOnly(filters.to)) {
    sendFailure(res, 400, 'BAD_REQUEST', 'Invalid date range. Use YYYY-MM-DD for from and to.');
    return;
  }
  if (filters.from > filters.to) {
    sendFailure(res, 400, 'BAD_REQUEST', 'from must be on or before to.');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const summary = await getFinancialSummary(client, tenantId, filters);
      sendSuccess(res, summary);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /dashboard/summaries/financial' });
  }
});

dashboardSummaryRouter.get('/dashboard/summaries/rental', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const q = req.query as Record<string, unknown>;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const summary = await getRentalSummary(client, tenantId, {
        buildingId: typeof q.buildingId === 'string' ? q.buildingId : undefined,
        propertyId: typeof q.propertyId === 'string' ? q.propertyId : undefined,
        status: typeof q.status === 'string' ? q.status : undefined,
        search: typeof q.search === 'string' ? q.search : undefined,
        includeArBreakdown:
          q.includeArBreakdown === 'true' || q.includeArBreakdown === '1',
      });
      sendSuccess(res, summary);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /dashboard/summaries/rental' });
  }
});

dashboardSummaryRouter.get('/dashboard/summaries/inventory', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const summary = await getInventorySummary(client, tenantId);
      sendSuccess(res, summary);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /dashboard/summaries/inventory' });
  }
});

dashboardSummaryRouter.get('/dashboard/summaries/project', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const filters = parseProjectSummaryFilters(req.query as Record<string, unknown>);
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const summary = await getProjectAgreementSummary(client, tenantId, filters);
      sendSuccess(res, summary);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /dashboard/summaries/project' });
  }
});

dashboardSummaryRouter.get('/dashboard/summaries/procurement', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const summary = await getProcurementSummary(client, tenantId);
      sendSuccess(res, summary);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /dashboard/summaries/procurement' });
  }
});
