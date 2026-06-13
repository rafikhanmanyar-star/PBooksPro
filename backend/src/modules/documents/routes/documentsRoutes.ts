import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import type { RequestWithAuditContext } from '../../../middleware/auditRequestContext.js';
import { getPool, withTransaction } from '../../../db/pool.js';
import {
  getDocumentById,
  getDocumentFile,
  listDocuments,
  rowToDocumentApi,
  softDeleteDocument,
  upsertDocument,
} from '../services/documentsModuleService.js';
import { emitEntityEvent } from '../../../core/realtime.js';

export const documentsRouter = Router();

documentsRouter.get('/documents', async (req: RequestWithAuditContext, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const entityType =
    typeof req.query.entity_type === 'string'
      ? req.query.entity_type
      : typeof req.query.entityType === 'string'
        ? req.query.entityType
        : undefined;
  const entityId =
    typeof req.query.entity_id === 'string'
      ? req.query.entity_id
      : typeof req.query.entityId === 'string'
        ? req.query.entityId
        : undefined;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listDocuments(client, tenantId, { entityType, entityId });
      sendSuccess(res, rows.map((r) => rowToDocumentApi(r)));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

documentsRouter.get('/documents/:id/file', async (req: RequestWithAuditContext, res) => {
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
      const file = await getDocumentFile(client, tenantId, id);
      if (!file) {
        sendFailure(res, 404, 'NOT_FOUND', 'Document not found');
        return;
      }
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(file.fileName)}"`
      );
      res.send(file.buffer);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

documentsRouter.get('/documents/:id', async (req: RequestWithAuditContext, res) => {
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
      const row = await getDocumentById(client, tenantId, id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Document not found');
        return;
      }
      sendSuccess(res, rowToDocumentApi(row));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

documentsRouter.post('/documents', async (req: RequestWithAuditContext, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const result = await withTransaction((client) =>
      upsertDocument(
        client,
        tenantId,
        req.body as Record<string, unknown>,
        req.userId ?? null,
        req.auditContext
      )
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user', {
        serverVersion: result.row.version,
      });
      return;
    }
    const apiRow = rowToDocumentApi(result.row);
    const action = result.wasInsert ? 'created' : 'updated';
    emitEntityEvent(tenantId, action, 'document', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow, result.wasInsert ? 201 : 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

documentsRouter.delete('/documents/:id', async (req: RequestWithAuditContext, res) => {
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
      softDeleteDocument(
        client,
        tenantId,
        id,
        expectedVersion,
        req.userId ?? null,
        req.auditContext
      )
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Version conflict');
      return;
    }
    if (!result.ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Document not found');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'document', { id, sourceUserId: req.userId });
    sendSuccess(res, { id });
  } catch (e) {
    handleRouteError(res, e);
  }
});
