import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../db/pool.js';
import {
  createProjectAgreement,
  enrichRowsWithUnitIds,
  getProjectAgreementById,
  listProjectAgreementsWithUnits,
  rowToProjectAgreementApi,
  softDeleteProjectAgreement,
  updateProjectAgreement,
} from '../services/projectAgreementsService.js';
import { listInvoices, rowToInvoiceApi } from '../services/invoicesService.js';
import { emitEntityEvent } from '../core/realtime.js';
import { LockGuardError } from '../services/recordLocksService.js';

export const projectAgreementsRouter = Router();

projectAgreementsRouter.get('/project-agreements', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : undefined;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listProjectAgreementsWithUnits(client, tenantId, { status, projectId, clientId });
      sendSuccess(res, rows.map(({ row, unitIds }) => rowToProjectAgreementApi(row, unitIds)),);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

projectAgreementsRouter.get('/project-agreements/:id/invoices', async (req: AuthedRequest, res) => {
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
      const row = await getProjectAgreementById(client, tenantId, id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Agreement not found');
        return;
      }
      const invRows = await listInvoices(client, tenantId, { agreementId: id });
      sendSuccess(res, invRows.map((r) => rowToInvoiceApi(r)));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

projectAgreementsRouter.get('/project-agreements/:id', async (req: AuthedRequest, res) => {
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
      const found = await getProjectAgreementById(client, tenantId, id);
      if (!found) {
        sendFailure(res, 404, 'NOT_FOUND', 'Agreement not found');
        return;
      }
      sendSuccess(res, rowToProjectAgreementApi(found.row, found.unitIds),);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

projectAgreementsRouter.post('/project-agreements', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const { row, unitIds } = await withTransaction((client) =>
      createProjectAgreement(client, tenantId, req.body as Record<string, unknown>)
    );
    const apiRow = rowToProjectAgreementApi(row, unitIds);
    emitEntityEvent(tenantId, 'created', 'agreement', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

projectAgreementsRouter.put('/project-agreements/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const result = await withTransaction((client) =>
      updateProjectAgreement(client, tenantId, id, req.body as Record<string, unknown>, req.userId)
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');
      return;
    }
    if (!result.row) {
      sendFailure(res, 404, 'NOT_FOUND', 'Agreement not found');
      return;
    }
    const apiRow = rowToProjectAgreementApi(result.row, result.unitIds);
    emitEntityEvent(tenantId, 'updated', 'agreement', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow);
  } catch (e) {
    if (e instanceof LockGuardError) {
      sendFailure(res, 409, String(e.code ?? 'CONFLICT'), e.message);
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

projectAgreementsRouter.delete('/project-agreements/:id', async (req: AuthedRequest, res) => {
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
      softDeleteProjectAgreement(
        client,
        tenantId,
        id,
        Number.isFinite(expectedVersion) ? expectedVersion : undefined,
        req.userId
      )
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');
      return;
    }
    if (!result.ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Agreement not found');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'agreement', { id, sourceUserId: req.userId });
    sendSuccess(res, { id });
  } catch (e) {
    if (e instanceof LockGuardError) {
      sendFailure(res, 409, String(e.code ?? 'CONFLICT'), e.message);
      return;
    }
    handleRouteError(res, e);
  }
});
