import { Router } from 'express';
import { getPool } from '../../../db/pool.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { memoryCacheGet, memoryCacheSet } from '../../../utils/memoryCache.js';
import {
  dashboardCacheKey,
  isValidDateOnly,
  parseDashboardFilters,
} from '../../../services/dashboard/dashboardMetricsHelpers.js';
import { getDashboardMetricsJson } from '../../../services/dashboard/dashboardMetricsService.js';
import { getDashboardChartsJson } from '../../../services/dashboard/dashboardChartsService.js';
import { getDashboardActivityJson } from '../../../services/dashboard/dashboardActivityService.js';

export const dashboardMetricsRouter = Router();

const TTL_MS = 300_000;

/**
 * GET /api/dashboard/metrics
 * Query: from, to (YYYY-MM-DD), comparisonPeriod, projectId, propertyId, vendorId, customerId, …
 */
dashboardMetricsRouter.get('/dashboard/metrics', async (req: AuthedRequest, res) => {
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

  const cacheKey = dashboardCacheKey(tenantId, filters);
  const cached = memoryCacheGet<Awaited<ReturnType<typeof getDashboardMetricsJson>>>(cacheKey);
  if (cached) {
    sendSuccess(res, cached);
    return;
  }

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const data = await getDashboardMetricsJson(client, tenantId, filters);
      memoryCacheSet(cacheKey, data, TTL_MS);
      sendSuccess(res, data);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /dashboard/metrics' });
  }
});

/**
 * GET /api/dashboard/charts?year=2026&from=…&to=…
 */
dashboardMetricsRouter.get('/dashboard/charts', async (req: AuthedRequest, res) => {
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

  const yearRaw = req.query.year;
  const year =
    typeof yearRaw === 'string' && /^\d{4}$/.test(yearRaw.trim())
      ? parseInt(yearRaw.trim(), 10)
      : undefined;

  const cacheKey = `${dashboardCacheKey(tenantId, filters)}:charts:${year ?? 'auto'}`;
  const cached = memoryCacheGet<Awaited<ReturnType<typeof getDashboardChartsJson>>>(cacheKey);
  if (cached) {
    sendSuccess(res, cached);
    return;
  }

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const data = await getDashboardChartsJson(client, tenantId, filters, year);
      memoryCacheSet(cacheKey, data, TTL_MS);
      sendSuccess(res, data);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /dashboard/charts' });
  }
});

/**
 * GET /api/dashboard/activity?limit=5
 */
dashboardMetricsRouter.get('/dashboard/activity', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }

  const limitRaw = req.query.limit;
  const limit =
    typeof limitRaw === 'string' && /^\d+$/.test(limitRaw.trim())
      ? parseInt(limitRaw.trim(), 10)
      : 5;

  const cacheKey = `dashboard_activity:${tenantId}:${limit}`;
  const cached = memoryCacheGet<Awaited<ReturnType<typeof getDashboardActivityJson>>>(cacheKey);
  if (cached) {
    sendSuccess(res, cached);
    return;
  }

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const data = await getDashboardActivityJson(client, tenantId, limit);
      memoryCacheSet(cacheKey, data, 60_000);
      sendSuccess(res, data);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /dashboard/activity' });
  }
});
