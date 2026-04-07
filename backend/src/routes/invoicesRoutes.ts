import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../db/pool.js';
import {
  getInvoiceById,
  listInvoices,
  rowToInvoiceApi,
  softDeleteInvoice,
  updateInvoice,
  upsertInvoice,
} from '../services/invoicesService.js';
import { emitEntityEvent } from '../core/realtime.js';
import { LockGuardError } from '../services/recordLocksService.js';

export const invoicesRouter = Router();

invoicesRouter.get('/invoices', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const invoiceType = typeof req.query.invoiceType === 'string' ? req.query.invoiceType : undefined;
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  const agreementId = typeof req.query.agreementId === 'string' ? req.query.agreementId : undefined;
  const includeDeletedRaw = req.query.includeDeleted;
  const includeDeleted =
    includeDeletedRaw === '1' ||
    includeDeletedRaw === 'true' ||
    includeDeletedRaw === 'yes';
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listInvoices(client, tenantId, {
        status,
        invoiceType,
        projectId,
        agreementId,
        includeDeleted,
      });
      sendSuccess(res, rows.map((r) => rowToInvoiceApi(r)));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

invoicesRouter.get('/invoices/:id', async (req: AuthedRequest, res) => {
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
      const row = await getInvoiceById(client, tenantId, id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Invoice not found');
        return;
      }
      sendSuccess(res, rowToInvoiceApi(row));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

invoicesRouter.post('/invoices', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const result = await withTransaction((client) =>
      upsertInvoice(client, tenantId, req.body as Record<string, unknown>, req.userId ?? null)
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user', { serverVersion: result.row.version });
      return;
    }
    const apiRow = rowToInvoiceApi(result.row);
    const action = result.wasInsert ? 'created' : 'updated';
    emitEntityEvent(tenantId, action, 'invoice', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow, result.wasInsert ? 201 : 200);
  } catch (e) {
    if (e instanceof LockGuardError) {
      sendFailure(res, 409, String(e.code ?? 'CONFLICT'), e.message);
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
      sendFailure(res, 409, 'DUPLICATE', msg);
      return;
    }
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

invoicesRouter.put('/invoices/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const body = { ...(req.body as Record<string, unknown>), id };
    const result = await withTransaction((client) =>
      updateInvoice(client, tenantId, id, body, req.userId)
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');
      return;
    }
    if (!result.row) {
      sendFailure(res, 404, 'NOT_FOUND', 'Invoice not found');
      return;
    }
    const apiRow = rowToInvoiceApi(result.row);
    emitEntityEvent(tenantId, 'updated', 'invoice', { data: apiRow, sourceUserId: req.userId });
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

invoicesRouter.delete('/invoices/:id', async (req: AuthedRequest, res) => {
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
      softDeleteInvoice(client, tenantId, id, Number.isFinite(expectedVersion) ? expectedVersion : undefined, req.userId)
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');
      return;
    }
    if (!result.ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Invoice not found');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'invoice', { id, sourceUserId: req.userId });
    sendSuccess(res, { id });
  } catch (e) {
    if (e instanceof LockGuardError) {
      sendFailure(res, 409, String(e.code ?? 'CONFLICT'), e.message);
      return;
    }
    handleRouteError(res, e);
  }
});
