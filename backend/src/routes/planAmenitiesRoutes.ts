import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { withTransaction } from '../db/pool.js';
import {
  getPlanAmenityById,
  listPlanAmenities,
  rowToPlanAmenityApi,
  softDeletePlanAmenity,
  upsertPlanAmenity,
} from '../services/planAmenitiesService.js';
import { emitEntityEvent } from '../core/realtime.js';

export const planAmenitiesRouter = Router();

planAmenitiesRouter.get('/plan-amenities', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const activeOnly = req.query.activeOnly === 'true' || req.query.active_only === 'true';
  try {
    const rows = await withTransaction((client) => listPlanAmenities(client, tenantId, { activeOnly }));
    sendSuccess(res, rows.map((r) => rowToPlanAmenityApi(r)));
  } catch (e) {
    handleRouteError(res, e);
  }
});

planAmenitiesRouter.get('/plan-amenities/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const row = await withTransaction((client) => getPlanAmenityById(client, tenantId, id));
    if (!row) {
      sendFailure(res, 404, 'NOT_FOUND', 'Plan amenity not found');
      return;
    }
    sendSuccess(res, rowToPlanAmenityApi(row));
  } catch (e) {
    handleRouteError(res, e);
  }
});

planAmenitiesRouter.post('/plan-amenities', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const result = await withTransaction((client) => upsertPlanAmenity(client, tenantId, req.body as Record<string, unknown>));
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user', { serverVersion: result.row.version });
      return;
    }
    const apiRow = rowToPlanAmenityApi(result.row);
    const action = result.wasInsert ? 'created' : 'updated';
    emitEntityEvent(tenantId, action, 'plan_amenity', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow, result.wasInsert ? 201 : 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

planAmenitiesRouter.put('/plan-amenities/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const body = { ...(req.body as Record<string, unknown>), id };
    const result = await withTransaction((client) => upsertPlanAmenity(client, tenantId, body));
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user', { serverVersion: result.row.version });
      return;
    }
    const apiRow = rowToPlanAmenityApi(result.row);
    emitEntityEvent(tenantId, 'updated', 'plan_amenity', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

planAmenitiesRouter.delete('/plan-amenities/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  const versionRaw = req.query.version;
  const expectedVersion =
    typeof versionRaw === 'string' && versionRaw.trim() !== '' ? parseInt(versionRaw, 10) : undefined;
  try {
    const { ok, conflict } = await withTransaction((client) =>
      softDeletePlanAmenity(client, tenantId, id, Number.isFinite(expectedVersion as number) ? expectedVersion : undefined)
    );
    if (conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');
      return;
    }
    if (!ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Plan amenity not found');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'plan_amenity', { id, sourceUserId: req.userId });
    sendSuccess(res, { id });
  } catch (e) {
    handleRouteError(res, e);
  }
});
