import { Router } from 'express';
import { getPool } from '../../../db/pool.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { memoryCacheGet, memoryCacheSet } from '../../../utils/memoryCache.js';
import { isValidDateOnly } from '../../../services/dashboard/dashboardMetricsHelpers.js';
import { getSellingAnalyticsJson } from '../../../services/dashboard/sellingAnalyticsService.js';
import type { SellingAnalyticsFilters } from '../../../services/dashboard/sellingAnalyticsTypes.js';

export const sellingAnalyticsRouter = Router();

const TTL_MS = 300_000;

function parseFilters(query: Record<string, unknown>): SellingAnalyticsFilters {
  const now = new Date();
  const defaultTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const from = typeof query.from === 'string' && isValidDateOnly(query.from) ? query.from : defaultFrom;
  const to = typeof query.to === 'string' && isValidDateOnly(query.to) ? query.to : defaultTo;
  const str = (k: string) => {
    const v = query[k];
    return typeof v === 'string' && v.trim() && v.trim() !== 'all' ? v.trim() : undefined;
  };
  return { from, to, projectId: str('projectId') };
}

sellingAnalyticsRouter.get('/selling/analytics', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }

  const filters = parseFilters(req.query as Record<string, unknown>);
  const cacheKey = `selling_analytics:${tenantId}:${filters.from}:${filters.to}:${filters.projectId ?? ''}`;
  const cached = memoryCacheGet<Awaited<ReturnType<typeof getSellingAnalyticsJson>>>(cacheKey);
  if (cached) {
    sendSuccess(res, cached);
    return;
  }

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const data = await getSellingAnalyticsJson(client, tenantId, filters);
      memoryCacheSet(cacheKey, data, TTL_MS);
      sendSuccess(res, data);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /selling/analytics' });
  }
});
