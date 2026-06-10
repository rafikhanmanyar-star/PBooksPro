import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { memoryCacheGet, memoryCacheSet } from '../utils/memoryCache.js';
import { isValidDateOnly } from '../services/dashboard/dashboardMetricsHelpers.js';
import { getBankingAnalyticsJson } from '../services/dashboard/bankingAnalyticsService.js';
import type { BankingAnalyticsFilters } from '../services/dashboard/bankingAnalyticsTypes.js';

export const bankingAnalyticsRouter = Router();

const TTL_MS = 300_000;

function parseFilters(query: Record<string, unknown>): BankingAnalyticsFilters {
  const now = new Date();
  const defaultTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const from = typeof query.from === 'string' && isValidDateOnly(query.from) ? query.from : defaultFrom;
  const to = typeof query.to === 'string' && isValidDateOnly(query.to) ? query.to : defaultTo;
  const accountId =
    typeof query.accountId === 'string' && query.accountId.trim() && query.accountId.trim() !== 'all'
      ? query.accountId.trim()
      : undefined;
  return { from, to, accountId };
}

bankingAnalyticsRouter.get('/banking/analytics', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }

  const filters = parseFilters(req.query as Record<string, unknown>);
  const cacheKey = `banking_analytics:${tenantId}:${filters.from}:${filters.to}:${filters.accountId ?? ''}`;
  const cached = memoryCacheGet<Awaited<ReturnType<typeof getBankingAnalyticsJson>>>(cacheKey);
  if (cached) {
    sendSuccess(res, cached);
    return;
  }

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const data = await getBankingAnalyticsJson(client, tenantId, filters);
      memoryCacheSet(cacheKey, data, TTL_MS);
      sendSuccess(res, data);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /banking/analytics' });
  }
});
