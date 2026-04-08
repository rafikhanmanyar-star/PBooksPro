import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../db/pool.js';
import {
  getCategoryById,
  getPlSubTypeForCategory,
  listCategories,
  fetchPlSubTypesForTenant,
  rowToCategoryApi,
  softDeleteCategory,
  updateCategory,
  upsertCategory,
} from '../services/categoriesService.js';
import { emitEntityEvent } from '../core/realtime.js';

export const categoriesRouter = Router();

categoriesRouter.get('/categories', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listCategories(client, tenantId);
      const plMap = await fetchPlSubTypesForTenant(client, tenantId);
      sendSuccess(res, rows.map((r) => rowToCategoryApi(r, plMap.get(r.id))));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

categoriesRouter.get('/categories/:id', async (req: AuthedRequest, res) => {
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
      const row = await getCategoryById(client, tenantId, id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Category not found');
        return;
      }
      const pl = await getPlSubTypeForCategory(client, tenantId, id);
      sendSuccess(res, rowToCategoryApi(row, pl));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

categoriesRouter.post('/categories', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const result = await withTransaction((client) =>
      upsertCategory(client, tenantId, req.body as Record<string, unknown>)
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user', { serverVersion: result.row.version });
      return;
    }
    const pool = getPool();
    const c2 = await pool.connect();
    let pl: string | undefined;
    try {
      pl = await getPlSubTypeForCategory(c2, tenantId, result.row.id);
    } finally {
      c2.release();
    }
    const apiRow = rowToCategoryApi(result.row, pl);
    const action = result.wasInsert ? 'created' : 'updated';
    emitEntityEvent(tenantId, action, 'category', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow, result.wasInsert ? 201 : 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
      sendFailure(res, 409, 'DUPLICATE', msg);
      return;
    }
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

categoriesRouter.put('/categories/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const body = { ...(req.body as Record<string, unknown>), id };
    const result = await withTransaction((client) => updateCategory(client, tenantId, id, body));
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');
      return;
    }
    if (!result.row) {
      sendFailure(res, 404, 'NOT_FOUND', 'Category not found');
      return;
    }
    const pool = getPool();
    const c2 = await pool.connect();
    let pl: string | undefined;
    try {
      pl = await getPlSubTypeForCategory(c2, tenantId, result.row.id);
    } finally {
      c2.release();
    }
    const apiRow = rowToCategoryApi(result.row, pl);
    emitEntityEvent(tenantId, 'updated', 'category', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

categoriesRouter.delete('/categories/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  const versionRaw = req.query.version;
  const expectedVersion =
    typeof versionRaw === 'string' && versionRaw !== '' ? Number(versionRaw) : undefined;

  try {
    const result = await withTransaction((client) =>
      softDeleteCategory(client, tenantId, id, Number.isFinite(expectedVersion) ? expectedVersion : undefined)
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');
      return;
    }
    if (!result.ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Category not found');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'category', { id, sourceUserId: req.userId });
    sendSuccess(res, { id });
  } catch (e) {
    handleRouteError(res, e);
  }
});
