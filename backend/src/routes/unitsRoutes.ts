import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../db/pool.js';
import {
  createUnit,
  getUnitById,
  listUnits,
  rowToUnitApi,
  softDeleteUnit,
  updateUnit,
} from '../services/unitsService.js';
import { emitEntityEvent } from '../core/realtime.js';

export const unitsRouter = Router();

unitsRouter.get('/units', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : undefined;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listUnits(client, tenantId, projectId ? { projectId } : undefined);
      sendSuccess(res, rows.map((r) => rowToUnitApi(r)));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

unitsRouter.get('/units/:id', async (req: AuthedRequest, res) => {
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
      const row = await getUnitById(client, tenantId, id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Unit not found');
        return;
      }
      sendSuccess(res, rowToUnitApi(row));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

unitsRouter.post('/units', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const row = await withTransaction((client) => createUnit(client, tenantId, req.body as Record<string, unknown>));
    const apiRow = rowToUnitApi(row);
    emitEntityEvent(tenantId, 'created', 'unit', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow, 201);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = typeof e === 'object' && e && 'code' in e ? (e as { code?: string }).code : '';
    if (code === '23505') {
      sendFailure(
        res,
        409,
        'DUPLICATE_UNIT',
        'A unit with this number already exists for this project.'
      );
      return;
    }
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

unitsRouter.put('/units/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const result = await withTransaction((client) =>
      updateUnit(client, tenantId, id, req.body as Record<string, unknown>)
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');
      return;
    }
    if (!result.row) {
      sendFailure(res, 404, 'NOT_FOUND', 'Unit not found');
      return;
    }
    const apiRow = rowToUnitApi(result.row);
    emitEntityEvent(tenantId, 'updated', 'unit', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = typeof e === 'object' && e && 'code' in e ? (e as { code?: string }).code : '';
    if (code === '23505') {
      sendFailure(
        res,
        409,
        'DUPLICATE_UNIT',
        'A unit with this number already exists for this project.'
      );
      return;
    }
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

unitsRouter.delete('/units/:id', async (req: AuthedRequest, res) => {
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
      softDeleteUnit(client, tenantId, id, Number.isFinite(expectedVersion) ? expectedVersion : undefined)
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');
      return;
    }
    if (!result.ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Unit not found');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'unit', { id, sourceUserId: req.userId });
    sendSuccess(res, { id });
  } catch (e) {
    handleRouteError(res, e);
  }
});
