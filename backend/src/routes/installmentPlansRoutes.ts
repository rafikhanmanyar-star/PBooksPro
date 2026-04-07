import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { withTransaction } from '../db/pool.js';
import {
  getInstallmentPlanById,
  listInstallmentPlans,
  rowToInstallmentPlanApi,
  softDeleteInstallmentPlan,
  upsertInstallmentPlan,
} from '../services/installmentPlansService.js';
import { emitEntityEvent } from '../core/realtime.js';

export const installmentPlansRouter = Router();

installmentPlansRouter.get('/installment-plans', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const projectId =
    typeof req.query.projectId === 'string' && req.query.projectId.trim()
      ? req.query.projectId.trim()
      : typeof req.query.project_id === 'string' && req.query.project_id.trim()
        ? req.query.project_id.trim()
        : undefined;
  try {
    const rows = await withTransaction((client) => listInstallmentPlans(client, tenantId, { projectId }));
    sendSuccess(res, rows.map((r) => rowToInstallmentPlanApi(r)));
  } catch (e) {
    handleRouteError(res, e);
  }
});

installmentPlansRouter.get('/installment-plans/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const row = await withTransaction((client) => getInstallmentPlanById(client, tenantId, id));
    if (!row) {
      sendFailure(res, 404, 'NOT_FOUND', 'Installment plan not found');
      return;
    }
    sendSuccess(res, rowToInstallmentPlanApi(row));
  } catch (e) {
    handleRouteError(res, e);
  }
});

installmentPlansRouter.post('/installment-plans', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const result = await withTransaction((client) =>
      upsertInstallmentPlan(client, tenantId, req.body as Record<string, unknown>, req.userId ?? null)
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user', { serverVersion: result.row.version });
      return;
    }
    const apiRow = rowToInstallmentPlanApi(result.row);
    const action = result.wasInsert ? 'created' : 'updated';
    emitEntityEvent(tenantId, action, 'installment_plan', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow, result.wasInsert ? 201 : 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('foreign key') || msg.includes('violates')) {
      sendFailure(res, 400, 'VALIDATION_ERROR', msg);
      return;
    }
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

installmentPlansRouter.put('/installment-plans/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const body = { ...(req.body as Record<string, unknown>), id };
    const result = await withTransaction((client) =>
      upsertInstallmentPlan(client, tenantId, body, req.userId ?? null)
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user', { serverVersion: result.row.version });
      return;
    }
    const apiRow = rowToInstallmentPlanApi(result.row);
    emitEntityEvent(tenantId, 'updated', 'installment_plan', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

installmentPlansRouter.delete('/installment-plans/:id', async (req: AuthedRequest, res) => {
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
      softDeleteInstallmentPlan(client, tenantId, id, Number.isFinite(expectedVersion as number) ? expectedVersion : undefined)
    );
    if (conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');
      return;
    }
    if (!ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Installment plan not found');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'installment_plan', { id, sourceUserId: req.userId });
    sendSuccess(res, { id });
  } catch (e) {
    handleRouteError(res, e);
  }
});
