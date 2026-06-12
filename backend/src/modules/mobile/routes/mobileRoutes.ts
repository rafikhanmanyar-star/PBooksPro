import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../../../db/pool.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { memoryCacheGet, memoryCacheSet } from '../../../utils/memoryCache.js';
import {
  getMobileConstructionSummary,
  getMobileCrmSummary,
  getMobileDashboardSummary,
  getMobileFinanceSummary,
  getMobileHrSummary,
  getMobileProjectSummary,
  getMobileRentalSummary,
  getMobileSalesSummary,
} from '../services/mobileDashboardService.js';
import {
  createUnpostedTransaction,
  getUnpostedTransaction,
  getUnpostedTransactionCounts,
  listUnpostedTransactions,
  parseCreateUnpostedTransaction,
  parseStatusUpdate,
  updateUnpostedTransactionStatus,
} from '../services/unpostedTransactionService.js';
import type { UnpostedTransactionStatus } from '../types/index.js';
import {
  approveMobileApproval,
  listMobileApprovals,
  rejectMobileApproval,
} from '../services/mobileApprovalsService.js';
import { listMobileNotifications } from '../services/mobileNotificationsService.js';

export const mobileRouter = Router();

const MOBILE_CACHE_TTL = 60_000;

async function withClient<T>(fn: (client: import('pg').PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

function mobileCacheKey(tenantId: string, endpoint: string): string {
  return `mobile:${tenantId}:${endpoint}`;
}

async function cachedSummary(
  tenantId: string,
  endpoint: string,
  loader: (client: import('pg').PoolClient, tenantId: string) => Promise<unknown>
) {
  const key = mobileCacheKey(tenantId, endpoint);
  const cached = memoryCacheGet(key);
  if (cached) return cached;
  const data = await withClient((client) => loader(client, tenantId));
  memoryCacheSet(key, data, MOBILE_CACHE_TTL);
  return data;
}

mobileRouter.get('/mobile/dashboard', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const data = await cachedSummary(tenantId, 'dashboard', getMobileDashboardSummary);
    sendSuccess(res, data);
  } catch (e) {
    handleRouteError(res, e);
  }
});

mobileRouter.get('/mobile/finance-summary', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const data = await cachedSummary(tenantId, 'finance', getMobileFinanceSummary);
    sendSuccess(res, data);
  } catch (e) {
    handleRouteError(res, e);
  }
});

mobileRouter.get('/mobile/sales-summary', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const data = await cachedSummary(tenantId, 'sales', getMobileSalesSummary);
    sendSuccess(res, data);
  } catch (e) {
    handleRouteError(res, e);
  }
});

mobileRouter.get('/mobile/crm-summary', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const data = await cachedSummary(tenantId, 'crm', getMobileCrmSummary);
    sendSuccess(res, data);
  } catch (e) {
    handleRouteError(res, e);
  }
});

mobileRouter.get('/mobile/project-summary', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const data = await cachedSummary(tenantId, 'project', getMobileProjectSummary);
    sendSuccess(res, data);
  } catch (e) {
    handleRouteError(res, e);
  }
});

mobileRouter.get('/mobile/construction-summary', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const data = await cachedSummary(tenantId, 'construction', getMobileConstructionSummary);
    sendSuccess(res, data);
  } catch (e) {
    handleRouteError(res, e);
  }
});

mobileRouter.get('/mobile/rental-summary', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const data = await cachedSummary(tenantId, 'rental', getMobileRentalSummary);
    sendSuccess(res, data);
  } catch (e) {
    handleRouteError(res, e);
  }
});

mobileRouter.get('/mobile/hr-summary', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const data = await cachedSummary(tenantId, 'hr', getMobileHrSummary);
    sendSuccess(res, data);
  } catch (e) {
    handleRouteError(res, e);
  }
});

mobileRouter.get('/mobile/unposted-transactions/counts', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const counts = await withClient((client) => getUnpostedTransactionCounts(client, tenantId));
    sendSuccess(res, counts);
  } catch (e) {
    handleRouteError(res, e);
  }
});

mobileRouter.get('/mobile/unposted-transactions', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const statusParam = req.query.status;
  let status: UnpostedTransactionStatus | UnpostedTransactionStatus[] | undefined;
  if (typeof statusParam === 'string' && statusParam.trim()) {
    status = statusParam.split(',').map((s) => s.trim()) as UnpostedTransactionStatus[];
  }
  const mineOnly = req.query.mine === 'true';
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const offset = Number(req.query.offset ?? 0);

  try {
    const items = await withClient((client) =>
      listUnpostedTransactions(client, tenantId, {
        status,
        createdBy: mineOnly ? userId : undefined,
        limit,
        offset,
      })
    );
    sendSuccess(res, items);
  } catch (e) {
    handleRouteError(res, e);
  }
});

mobileRouter.get('/mobile/unposted-transactions/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const item = await withClient((client) =>
      getUnpostedTransaction(client, tenantId, req.params.id)
    );
    if (!item) {
      sendFailure(res, 404, 'NOT_FOUND', 'Transaction not found');
      return;
    }
    sendSuccess(res, item);
  } catch (e) {
    handleRouteError(res, e);
  }
});

mobileRouter.post('/mobile/unposted-transactions', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const input = parseCreateUnpostedTransaction(req.body);
    const item = await withClient((client) =>
      createUnpostedTransaction(client, tenantId, userId, input)
    );
    sendSuccess(res, item, 201);
  } catch (e) {
    if (e instanceof z.ZodError) {
      sendFailure(res, 400, 'VALIDATION_ERROR', e.errors.map((x) => x.message).join('; '));
      return;
    }
    handleRouteError(res, e);
  }
});

mobileRouter.patch('/mobile/unposted-transactions/:id/status', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const { status, rejectionReason } = parseStatusUpdate(req.body);
    const item = await withClient((client) =>
      updateUnpostedTransactionStatus(client, tenantId, req.params.id, userId, status, rejectionReason)
    );
    if (!item) {
      sendFailure(res, 404, 'NOT_FOUND', 'Transaction not found');
      return;
    }
    sendSuccess(res, item);
  } catch (e) {
    if (e instanceof z.ZodError) {
      sendFailure(res, 400, 'VALIDATION_ERROR', e.errors.map((x) => x.message).join('; '));
      return;
    }
    handleRouteError(res, e);
  }
});

mobileRouter.get('/mobile/approvals', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const items = await withClient((client) =>
      listMobileApprovals(client, tenantId, userId, req.role)
    );
    sendSuccess(res, items);
  } catch (e) {
    handleRouteError(res, e);
  }
});

mobileRouter.post('/mobile/approvals/:type/:id/approve', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const result = await withClient((client) =>
      approveMobileApproval(client, tenantId, userId, req.role, req.params.type, req.params.id)
    );
    sendSuccess(res, result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('permission') || msg.includes('Insufficient')) {
      sendFailure(res, 403, 'FORBIDDEN', msg);
      return;
    }
    handleRouteError(res, e);
  }
});

mobileRouter.post('/mobile/approvals/:type/:id/reject', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
  try {
    const result = await withClient((client) =>
      rejectMobileApproval(client, tenantId, userId, req.role, req.params.type, req.params.id, reason)
    );
    sendSuccess(res, result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('permission') || msg.includes('Insufficient')) {
      sendFailure(res, 403, 'FORBIDDEN', msg);
      return;
    }
    handleRouteError(res, e);
  }
});

mobileRouter.get('/mobile/notifications', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const items = await withClient((client) =>
      listMobileNotifications(client, tenantId, userId, req.role)
    );
    sendSuccess(res, items);
  } catch (e) {
    handleRouteError(res, e);
  }
});
