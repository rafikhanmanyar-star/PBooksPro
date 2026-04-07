import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../db/pool.js';
import {
  getPmCycleAllocationById,
  listPmCycleAllocations,
  rowToPmCycleAllocationApi,
  softDeletePmCycleAllocation,
  upsertPmCycleAllocation,
} from '../services/pmCycleAllocationsService.js';
import { emitEntityEvent } from '../core/realtime.js';

export const pmCycleAllocationsRouter = Router();

pmCycleAllocationsRouter.get('/pm-cycle-allocations', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  const cycleId = typeof req.query.cycleId === 'string' ? req.query.cycleId : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listPmCycleAllocations(client, tenantId, { projectId, cycleId, status });
      sendSuccess(res, rows.map((r) => rowToPmCycleAllocationApi(r)));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

pmCycleAllocationsRouter.get('/pm-cycle-allocations/:id', async (req: AuthedRequest, res) => {
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
      const row = await getPmCycleAllocationById(client, tenantId, id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Allocation not found');
        return;
      }
      sendSuccess(res, rowToPmCycleAllocationApi(row));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

/** Upsert (matches client POST for create/update). */
pmCycleAllocationsRouter.post('/pm-cycle-allocations', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const row = await withTransaction((client) =>
      upsertPmCycleAllocation(client, tenantId, req.body as Record<string, unknown>, req.userId ?? null)
    );
    const apiRow = rowToPmCycleAllocationApi(row);
    emitEntityEvent(tenantId, 'updated', 'pm_cycle_allocation', {
      data: apiRow,
      sourceUserId: req.userId,
    });
    sendSuccess(res, apiRow);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('modified by another user')) {
      sendFailure(res, 409, 'CONFLICT', msg);
      return;
    }
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

pmCycleAllocationsRouter.delete('/pm-cycle-allocations/:id', async (req: AuthedRequest, res) => {
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
      softDeletePmCycleAllocation(
        client,
        tenantId,
        id,
        Number.isFinite(expectedVersion) ? expectedVersion : undefined
      )
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');
      return;
    }
    if (!result.ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Allocation not found');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'pm_cycle_allocation', { id, sourceUserId: req.userId });
    sendSuccess(res, { id });
  } catch (e) {
    handleRouteError(res, e);
  }
});
