import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../db/pool.js';
import {
  createProperty,
  getPropertyById,
  listProperties,
  rowToPropertyApi,
  softDeleteProperty,
  updateProperty,
} from '../services/propertiesService.js';
import {
  listPropertyOwnership,
  rowToPropertyOwnershipApi,
  syncPropertyOwnershipRowsForProperty,
  type PropertyOwnershipSyncRow,
} from '../services/propertyOwnershipPgService.js';
import {
  getOwnershipSegmentById,
  listOwnershipSegmentsForTenant,
  segmentListToApi,
  segmentToDetailApi,
  softDeleteOwnershipSegment,
  transferPropertyOwnership,
  type TransferOwnershipBody,
} from '../services/propertyOwnershipTransferService.js';
import { emitEntityEvent } from '../core/realtime.js';

export const propertiesRouter = Router();

propertiesRouter.get('/properties', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const buildingId = typeof req.query.buildingId === 'string' ? req.query.buildingId : undefined;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listProperties(client, tenantId, buildingId ? { buildingId } : undefined);
      sendSuccess(res, rows.map((r) => rowToPropertyApi(r)));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

/** Static path must be registered before `/properties/:id` or `id` captures the literal `ownership`. */
propertiesRouter.get('/properties/ownership', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listPropertyOwnership(client, tenantId);
      sendSuccess(res, rows.map((r) => rowToPropertyOwnershipApi(r)));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

/** Admin-style list: all ownership segments with property and owner names (newest first). */
propertiesRouter.get('/properties/ownership/segments', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listOwnershipSegmentsForTenant(client, tenantId, { includeDeleted });
      sendSuccess(res, segmentListToApi(rows));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

propertiesRouter.get('/properties/ownership/segments/:segmentId', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { segmentId } = req.params;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const row = await getOwnershipSegmentById(client, tenantId, segmentId);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Ownership segment not found');
        return;
      }
      sendSuccess(res, segmentToDetailApi(row));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

propertiesRouter.delete('/properties/ownership/segments/:segmentId', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { segmentId } = req.params;
  try {
    const pool = getPool();
    const client = await pool.connect();
    let propertyId: string | undefined;
    try {
      const row = await getOwnershipSegmentById(client, tenantId, segmentId);
      propertyId = row?.property_id;
    } finally {
      client.release();
    }
    const ok = await withTransaction((c) => softDeleteOwnershipSegment(c, tenantId, segmentId));
    if (!ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Ownership segment not found or already deleted');
      return;
    }
    if (propertyId) {
      emitEntityEvent(tenantId, 'updated', 'property', { id: propertyId, sourceUserId: req.userId });
    }
    sendSuccess(res, { id: segmentId });
  } catch (e) {
    handleRouteError(res, e);
  }
});

/** Atomic server-side ownership transfer (closes open rows, inserts new slices, updates property.owner_id). */
propertiesRouter.post('/properties/:id/ownership/transfer', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id: propertyId } = req.params;
  const body = req.body as TransferOwnershipBody;
  try {
    const result = await withTransaction((client) =>
      transferPropertyOwnership(client, tenantId, propertyId, body)
    );
    emitEntityEvent(tenantId, 'updated', 'property', { data: result.property, sourceUserId: req.userId });
    sendSuccess(res, result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

/** After client-side transfer: persist `property_ownership` rows for one property (LAN/API). */
propertiesRouter.post('/properties/:id/ownership/sync', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  const body = req.body as { rows?: PropertyOwnershipSyncRow[] };
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!rows) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'rows array is required');
    return;
  }
  try {
    await withTransaction((client) => syncPropertyOwnershipRowsForProperty(client, tenantId, id, rows));
    sendSuccess(res, { ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

propertiesRouter.get('/properties/:id', async (req: AuthedRequest, res) => {
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
      const row = await getPropertyById(client, tenantId, id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Property not found');
        return;
      }
      sendSuccess(res, rowToPropertyApi(row));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

propertiesRouter.post('/properties', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const row = await withTransaction((client) =>
      createProperty(client, tenantId, req.body as Record<string, unknown>)
    );
    const apiRow = rowToPropertyApi(row);
    emitEntityEvent(tenantId, 'created', 'property', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

propertiesRouter.put('/properties/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const result = await withTransaction((client) =>
      updateProperty(client, tenantId, id, req.body as Record<string, unknown>)
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');
      return;
    }
    if (!result.row) {
      sendFailure(res, 404, 'NOT_FOUND', 'Property not found');
      return;
    }
    const apiRow = rowToPropertyApi(result.row);
    emitEntityEvent(tenantId, 'updated', 'property', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

propertiesRouter.delete('/properties/:id', async (req: AuthedRequest, res) => {
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
      softDeleteProperty(client, tenantId, id, Number.isFinite(expectedVersion) ? expectedVersion : undefined)
    );
    if (result.blocked) {
      sendFailure(res, 400, 'HAS_DEPENDENCIES', 'Cannot delete property while it has rental agreements. Remove or end agreements first.');
      return;
    }
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');
      return;
    }
    if (!result.ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Property not found');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'property', { id, sourceUserId: req.userId });
    sendSuccess(res, { id });
  } catch (e) {
    handleRouteError(res, e);
  }
});
