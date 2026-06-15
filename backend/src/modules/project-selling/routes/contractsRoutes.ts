import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { requirePermission } from '../../../middleware/rbacMiddleware.js';
import { getPool, withTransaction } from '../../../db/pool.js';
import {
  getContractById,
  listContracts,
  rowToContractApi,
  softDeleteContract,
  upsertContract,
} from '../../vendors/services/contractsService.js';
import {
  getContractRetentionSummary,
  getRetentionMonitoringDashboard,
  releaseRetention,
  validateRetentionThresholdForContract,
} from '../../vendors/services/contractRetentionService.js';
import { emitEntityEvent } from '../../../core/realtime.js';

export const contractsRouter = Router();

contractsRouter.get('/contracts', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  const vendorId = typeof req.query.vendorId === 'string' ? req.query.vendorId : undefined;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listContracts(client, tenantId, { status, projectId, vendorId });
      sendSuccess(res, rows.map((r) => rowToContractApi(r)));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

contractsRouter.get('/contracts/retention-monitoring', requirePermission('contracts.retention.view'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  const vendorId = typeof req.query.vendorId === 'string' ? req.query.vendorId : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined;
  const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const data = await getRetentionMonitoringDashboard(client, tenantId, {
        projectId,
        vendorId,
        status,
        dateFrom,
        dateTo,
      });
      sendSuccess(res, data);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

contractsRouter.get('/contracts/:id', async (req: AuthedRequest, res) => {
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
      const row = await getContractById(client, tenantId, id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Contract not found');
        return;
      }
      sendSuccess(res, rowToContractApi(row));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

contractsRouter.post('/contracts', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const result = await withTransaction((client) =>
      upsertContract(client, tenantId, req.body as Record<string, unknown>, req.userId ?? null)
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user', { serverVersion: result.row.version });
      return;
    }
    const apiRow = rowToContractApi(result.row);
    const action = result.wasInsert ? 'created' : 'updated';
    emitEntityEvent(tenantId, action, 'contract', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow, result.wasInsert ? 201 : 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

contractsRouter.get('/contracts/:id/retention-summary', requirePermission('contracts.retention.view'), async (req: AuthedRequest, res) => {
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
      const row = await getContractById(client, tenantId, id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Contract not found');
        return;
      }
      const summary = await getContractRetentionSummary(client, tenantId, row);
      sendSuccess(res, summary);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

contractsRouter.post('/contracts/:id/validate-retention', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  const additionalPayment = Number((req.body as { additionalPayment?: number })?.additionalPayment ?? 0);
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const row = await getContractById(client, tenantId, id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Contract not found');
        return;
      }
      const validation = await validateRetentionThresholdForContract(client, tenantId, row, {
        additionalPayment: Number.isFinite(additionalPayment) ? additionalPayment : 0,
      });
      sendSuccess(res, validation);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

contractsRouter.post('/contracts/:id/release-retention', requirePermission('contracts.retention.release'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  const body = req.body as { amount?: number; fullRelease?: boolean; releaseDate?: string };
  try {
    const result = await withTransaction((client) =>
      releaseRetention(client, tenantId, id, req.userId ?? null, body)
    );
    const apiRow = rowToContractApi(result);
    emitEntityEvent(tenantId, 'updated', 'contract', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

contractsRouter.delete('/contracts/:id', async (req: AuthedRequest, res) => {
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
      softDeleteContract(client, tenantId, id, Number.isFinite(expectedVersion) ? expectedVersion : undefined)
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Version conflict');
      return;
    }
    if (!result.ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Contract not found');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'contract', { id, sourceUserId: req.userId });
    sendSuccess(res, { id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});
