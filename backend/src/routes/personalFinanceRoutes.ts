import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../db/pool.js';
import {
  createPersonalCategory,
  getPersonalCategoryById,
  listPersonalCategories,
  rowToPersonalCategoryApi,
  softDeletePersonalCategory,
  updatePersonalCategory,
} from '../services/personalCategoriesService.js';
import {
  bulkCreatePersonalTransactions,
  createPersonalTransaction,
  getPersonalTransactionById,
  listPersonalTransactions,
  rowToPersonalTransactionApi,
  softDeletePersonalTransaction,
  updatePersonalTransaction,
} from '../services/personalTransactionsService.js';
import { emitEntityEvent } from '../core/realtime.js';

export const personalFinanceRouter = Router();

// --- Personal categories ---

personalFinanceRouter.get('/personal-categories', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listPersonalCategories(client, tenantId);
      sendSuccess(res, rows.map((r) => rowToPersonalCategoryApi(r)));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

personalFinanceRouter.get('/personal-categories/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const row = await getPersonalCategoryById(client, tenantId, id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Not found');
        return;
      }
      sendSuccess(res, rowToPersonalCategoryApi(row));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

personalFinanceRouter.post('/personal-categories', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const row = await withTransaction((c) => createPersonalCategory(c, tenantId, req.body || {}));
    const apiRow = rowToPersonalCategoryApi(row);
    emitEntityEvent(tenantId, 'created', 'personal_category', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

personalFinanceRouter.put('/personal-categories/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const row = await withTransaction((c) => updatePersonalCategory(c, tenantId, id, req.body || {}));
    if (!row) {
      sendFailure(res, 404, 'NOT_FOUND', 'Not found');
      return;
    }
    const apiRow = rowToPersonalCategoryApi(row);
    emitEntityEvent(tenantId, 'updated', 'personal_category', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = msg.includes('Conflict') ? 'CONFLICT' : 'VALIDATION_ERROR';
    sendFailure(res, code === 'CONFLICT' ? 409 : 400, String(code), msg);
  }
});

personalFinanceRouter.delete('/personal-categories/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  const versionRaw = req.query.version;
  const version =
    typeof versionRaw === 'string' && versionRaw !== '' ? parseInt(versionRaw, 10) : undefined;
  try {
    const row = await withTransaction((c) => softDeletePersonalCategory(c, tenantId, id, version));
    if (!row) {
      sendFailure(res, 404, 'NOT_FOUND', 'Not found');
      return;
    }
    const apiRow = rowToPersonalCategoryApi(row);
    emitEntityEvent(tenantId, 'deleted', 'personal_category', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = msg.includes('Conflict') ? 'CONFLICT' : 'SERVER_ERROR';
    sendFailure(res, code === 'CONFLICT' ? 409 : 500, String(code), msg);
  }
});

// --- Personal transactions ---

personalFinanceRouter.get('/personal-transactions', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listPersonalTransactions(client, tenantId);
      sendSuccess(res, rows.map((r) => rowToPersonalTransactionApi(r)));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

personalFinanceRouter.post('/personal-transactions/bulk', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const raw = req.body?.transactions ?? req.body?.items;
  const items = Array.isArray(raw) ? raw : [];
  if (items.length === 0) {
    sendSuccess(res, { imported: 0 }, 201);
    return;
  }
  try {
    const result = await withTransaction((c) =>
      bulkCreatePersonalTransactions(c, tenantId, items as Record<string, unknown>[])
    );
    sendSuccess(res, result, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

personalFinanceRouter.get('/personal-transactions/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const row = await getPersonalTransactionById(client, tenantId, id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Not found');
        return;
      }
      sendSuccess(res, rowToPersonalTransactionApi(row));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

personalFinanceRouter.post('/personal-transactions', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const row = await withTransaction((c) => createPersonalTransaction(c, tenantId, req.body || {}));
    const apiRow = rowToPersonalTransactionApi(row);
    emitEntityEvent(tenantId, 'created', 'personal_transaction', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

personalFinanceRouter.put('/personal-transactions/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const row = await withTransaction((c) => updatePersonalTransaction(c, tenantId, id, req.body || {}));
    if (!row) {
      sendFailure(res, 404, 'NOT_FOUND', 'Not found');
      return;
    }
    const apiRow = rowToPersonalTransactionApi(row);
    emitEntityEvent(tenantId, 'updated', 'personal_transaction', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = msg.includes('Conflict') ? 'CONFLICT' : 'VALIDATION_ERROR';
    sendFailure(res, code === 'CONFLICT' ? 409 : 400, String(code), msg);
  }
});

personalFinanceRouter.delete('/personal-transactions/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  const versionRaw = req.query.version;
  const version =
    typeof versionRaw === 'string' && versionRaw !== '' ? parseInt(versionRaw, 10) : undefined;
  try {
    const row = await withTransaction((c) => softDeletePersonalTransaction(c, tenantId, id, version));
    if (!row) {
      sendFailure(res, 404, 'NOT_FOUND', 'Not found');
      return;
    }
    const apiRow = rowToPersonalTransactionApi(row);
    emitEntityEvent(tenantId, 'deleted', 'personal_transaction', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = msg.includes('Conflict') ? 'CONFLICT' : 'SERVER_ERROR';
    sendFailure(res, code === 'CONFLICT' ? 409 : 500, String(code), msg);
  }
});
