import { Router } from 'express';
import { getPool } from '../../../db/pool.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { memoryCacheGet, memoryCacheSet } from '../../../utils/memoryCache.js';
import { isValidDateOnly } from '../../../services/dashboard/dashboardMetricsHelpers.js';
import { getCollectionsAnalyticsJson } from '../../../services/dashboard/collectionsAnalyticsService.js';
import type {
  CollectionsAnalyticsFilters,
  CollectionsScope,
} from '../../../services/dashboard/collectionsAnalyticsTypes.js';

export const collectionsAnalyticsRouter = Router();

const TTL_MS = 300_000;

function parseFilters(query: Record<string, unknown>): CollectionsAnalyticsFilters {
  const now = new Date();
  const defaultTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const from = typeof query.from === 'string' && isValidDateOnly(query.from) ? query.from : defaultFrom;
  const to = typeof query.to === 'string' && isValidDateOnly(query.to) ? query.to : defaultTo;
  const str = (k: string) => {
    const v = query[k];
    return typeof v === 'string' && v.trim() && v.trim() !== 'all' ? v.trim() : undefined;
  };
  const scopeRaw = typeof query.scope === 'string' ? query.scope.trim() : '';
  const scope: CollectionsScope | undefined =
    scopeRaw === 'project' || scopeRaw === 'rental' || scopeRaw === 'all' ? scopeRaw : undefined;
  return { from, to, scope, projectId: str('projectId'), propertyId: str('propertyId') };
}

collectionsAnalyticsRouter.get('/collections/analytics', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }

  const filters = parseFilters(req.query as Record<string, unknown>);
  const cacheKey = `collections_analytics:${tenantId}:${filters.from}:${filters.to}:${filters.scope ?? 'all'}:${filters.projectId ?? ''}:${filters.propertyId ?? ''}`;
  const cached = memoryCacheGet<Awaited<ReturnType<typeof getCollectionsAnalyticsJson>>>(cacheKey);
  if (cached) {
    sendSuccess(res, cached);
    return;
  }

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const data = await getCollectionsAnalyticsJson(client, tenantId, filters);
      memoryCacheSet(cacheKey, data, TTL_MS);
      sendSuccess(res, data);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /collections/analytics' });
  }
});
