import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../db/pool.js';
import {
  getProjectReceivedAssetById,
  listProjectReceivedAssets,
  rowToProjectReceivedAssetApi,
  softDeleteProjectReceivedAsset,
  upsertProjectReceivedAsset,
} from '../services/projectReceivedAssetsService.js';
import { emitEntityEvent } from '../core/realtime.js';

export const projectReceivedAssetsRouter = Router();

projectReceivedAssetsRouter.get('/project-received-assets', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listProjectReceivedAssets(client, tenantId, { projectId });
      sendSuccess(res, rows.map((r) => rowToProjectReceivedAssetApi(r)));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

projectReceivedAssetsRouter.get('/project-received-assets/:id', async (req: AuthedRequest, res) => {
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
      const row = await getProjectReceivedAssetById(client, tenantId, id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Asset not found');
        return;
      }
      sendSuccess(res, rowToProjectReceivedAssetApi(row));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

projectReceivedAssetsRouter.post('/project-received-assets', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const result = await withTransaction((client) =>
      upsertProjectReceivedAsset(client, tenantId, req.body as Record<string, unknown>, req.userId ?? null)
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user', { serverVersion: result.row.version });
      return;
    }
    const apiRow = rowToProjectReceivedAssetApi(result.row);
    const action = result.wasInsert ? 'created' : 'updated';
    emitEntityEvent(tenantId, action, 'project_received_asset', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow, result.wasInsert ? 201 : 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

projectReceivedAssetsRouter.delete('/project-received-assets/:id', async (req: AuthedRequest, res) => {
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
      softDeleteProjectReceivedAsset(client, tenantId, id, expectedVersion)
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Version conflict');
      return;
    }
    if (!result.ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Asset not found');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'project_received_asset', { id, sourceUserId: req.userId });
    sendSuccess(res, { id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});
