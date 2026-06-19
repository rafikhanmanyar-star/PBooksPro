import { Router } from 'express';
import { getPool } from '../../../db/pool.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { memoryCacheGet, memoryCacheSet } from '../../../utils/memoryCache.js';
import {
  getBrokerBalancesAggregation,
  getDashboardKpiAggregation,
  getOwnerBalancesAggregation,
  getVendorBalancesAggregation,
  parseDashboardKpiFilters,
  getProcurementStockAggregation,
} from '../../../services/aggregations/index.js';

export const aggregationRouter = Router();

const TTL_MS = 300_000;

aggregationRouter.get('/aggregations/owner-balances', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }

  const ownerId = typeof req.query.ownerId === 'string' ? req.query.ownerId.trim() : undefined;
  const buildingId = typeof req.query.buildingId === 'string' ? req.query.buildingId.trim() : undefined;
  const propertyId = typeof req.query.propertyId === 'string' ? req.query.propertyId.trim() : undefined;
  const cacheKey = `agg:owner:${tenantId}:${ownerId ?? ''}:${buildingId ?? ''}:${propertyId ?? ''}`;
  const cached = memoryCacheGet<unknown>(cacheKey);
  if (cached) {
    sendSuccess(res, cached);
    return;
  }

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const payload = await getOwnerBalancesAggregation(client, tenantId, {
        ownerId,
        buildingId,
        propertyId,
      });
      memoryCacheSet(cacheKey, payload, TTL_MS);
      sendSuccess(res, payload);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /aggregations/owner-balances' });
  }
});

aggregationRouter.get('/aggregations/vendor-balances', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }

  const vendorId = typeof req.query.vendorId === 'string' ? req.query.vendorId.trim() : undefined;
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId.trim() : undefined;
  const buildingId = typeof req.query.buildingId === 'string' ? req.query.buildingId.trim() : undefined;
  const propertyId = typeof req.query.propertyId === 'string' ? req.query.propertyId.trim() : undefined;
  const cacheKey = `agg:vendor:${tenantId}:${vendorId ?? ''}:${projectId ?? ''}:${buildingId ?? ''}:${propertyId ?? ''}`;
  const cached = memoryCacheGet<unknown>(cacheKey);
  if (cached) {
    sendSuccess(res, cached);
    return;
  }

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const payload = await getVendorBalancesAggregation(client, tenantId, {
        vendorId,
        projectId,
        buildingId,
        propertyId,
      });
      memoryCacheSet(cacheKey, payload, TTL_MS);
      sendSuccess(res, payload);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /aggregations/vendor-balances' });
  }
});

aggregationRouter.get('/aggregations/broker-balances', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }

  const contextRaw = typeof req.query.context === 'string' ? req.query.context.trim() : 'all';
  const context =
    contextRaw === 'Rental' || contextRaw === 'Project' ? contextRaw : ('all' as const);
  const cacheKey = `agg:broker:${tenantId}:${context}`;
  const cached = memoryCacheGet<unknown>(cacheKey);
  if (cached) {
    sendSuccess(res, cached);
    return;
  }

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const payload = await getBrokerBalancesAggregation(client, tenantId, context);
      memoryCacheSet(cacheKey, payload, TTL_MS);
      sendSuccess(res, payload);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /aggregations/broker-balances' });
  }
});

aggregationRouter.get('/aggregations/dashboard-kpis', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }

  const filters = parseDashboardKpiFilters(req.query as Record<string, unknown>);
  if (!filters) {
    sendFailure(res, 400, 'BAD_REQUEST', 'Invalid date range. Use YYYY-MM-DD for from and to.');
    return;
  }

  const cacheKey = `agg:dashboard-kpis:${tenantId}:${filters.from}:${filters.to}:${filters.projectId ?? ''}:${filters.buildingId ?? ''}:${filters.propertyId ?? ''}`;
  const cached = memoryCacheGet<unknown>(cacheKey);
  if (cached) {
    sendSuccess(res, cached);
    return;
  }

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const payload = await getDashboardKpiAggregation(client, tenantId, filters);
      memoryCacheSet(cacheKey, payload, TTL_MS);
      sendSuccess(res, payload);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /aggregations/dashboard-kpis' });
  }
});

aggregationRouter.get('/aggregations/procurement-stock', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }

  const cacheKey = `agg:procurement-stock:${tenantId}`;
  const cached = memoryCacheGet<unknown>(cacheKey);
  if (cached) {
    sendSuccess(res, cached);
    return;
  }

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const payload = await getProcurementStockAggregation(client, tenantId);
      memoryCacheSet(cacheKey, payload, TTL_MS);
      sendSuccess(res, payload);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /aggregations/procurement-stock' });
  }
});
