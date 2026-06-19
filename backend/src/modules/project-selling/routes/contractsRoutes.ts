import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError, sendVersionConflict } from '../../../utils/apiResponse.js';
import { respondVersionConflict } from '../../../utils/versionConflict.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { requirePermission } from '../../../middleware/rbacMiddleware.js';
import { getPool, withTransaction } from '../../../db/pool.js';
import {
  getContractById,
  listContracts,
  rowToContractApi,
  softDeleteContract,
  upsertContract,
  submitContractForApproval,
  approveContract,
} from '../../vendors/services/contractsService.js';
import {
  getContractRetentionSummary,
  getRetentionMonitoringDashboard,
  releaseRetention,
  validateRetentionThresholdForContract,
} from '../../vendors/services/contractRetentionService.js';
import { queueEntityEvent } from '../../../core/entityEventEmissions.js';

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
    const result = await withTransaction(async (client) => {
      const r = await upsertContract(client, tenantId, req.body as Record<string, unknown>, req.userId ?? null);
      if (!r.conflict) {
        const action = r.wasInsert ? 'created' : 'updated';
        queueEntityEvent(tenantId, action, 'contract', {
          data: rowToContractApi(r.row),
          sourceUserId: req.userId,
        });
      }
      return r;
    });
    if (result.conflict) {
      sendVersionConflict(res, result.row.version);
      return;
    }
    sendSuccess(res, rowToContractApi(result.row), result.wasInsert ? 201 : 200);
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
  const body = req.body as {
    amount?: number;
    fullRelease?: boolean;
    releaseDate?: string;
    version?: number;
  };
  try {
    const result = await withTransaction(async (client) => {
      const r = await releaseRetention(client, tenantId, id, req.userId ?? null, body);
      if (!r.conflict) {
        queueEntityEvent(tenantId, 'updated', 'contract', {
          data: rowToContractApi(r.row),
          sourceUserId: req.userId,
        });
      }
      return r;
    });
    if (result.conflict) {
      sendVersionConflict(res, result.row.version);
      return;
    }
    sendSuccess(res, rowToContractApi(result.row));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

contractsRouter.post('/contracts/:id/submit', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const body = req.body as Record<string, unknown>;
  const expectedVersion = typeof body.version === 'number' ? body.version : undefined;
  try {
    const result = await withTransaction(async (client) => {
      const r = await submitContractForApproval(
        client,
        tenantId,
        req.params.id,
        expectedVersion,
        req.userId ?? null,
        req.role ?? null
      );
      if (!r.conflict) {
        queueEntityEvent(tenantId, 'updated', 'contract', {
          data: rowToContractApi(r.row),
          sourceUserId: req.userId,
        });
      }
      return r;
    });
    if (result.conflict) {
      sendVersionConflict(res, result.serverVersion);
      return;
    }
    sendSuccess(res, rowToContractApi(result.row));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

contractsRouter.post('/contracts/:id/approve', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const body = req.body as Record<string, unknown>;
  const expectedVersion = typeof body.version === 'number' ? body.version : undefined;
  try {
    const result = await withTransaction(async (client) => {
      const r = await approveContract(client, tenantId, req.params.id, expectedVersion, req.userId ?? null);
      if (!r.conflict) {
        queueEntityEvent(tenantId, 'updated', 'contract', {
          data: rowToContractApi(r.row),
          sourceUserId: req.userId,
        });
      }
      return r;
    });
    if (result.conflict) {
      sendVersionConflict(res, result.serverVersion);
      return;
    }
    sendSuccess(res, rowToContractApi(result.row));
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
    const result = await withTransaction(async (client) => {
      const r = await softDeleteContract(
        client,
        tenantId,
        id,
        Number.isFinite(expectedVersion) ? expectedVersion : undefined
      );
      if (!r.conflict && r.ok) {
        queueEntityEvent(tenantId, 'deleted', 'contract', { id, sourceUserId: req.userId });
      }
      return r;
    });
    if (result.conflict) {
      await respondVersionConflict(res, async () => {
        const pool = getPool();
        const c = await pool.connect();
        try {
          return (await getContractById(c, tenantId, id))?.version;
        } finally {
          c.release();
        }
      });
      return;
    }
    if (!result.ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Contract not found');
      return;
    }
    sendSuccess(res, { id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});
