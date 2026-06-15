import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError, sendVersionConflict } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../../../db/pool.js';
import { requirePermission } from '../../../middleware/rbacMiddleware.js';
import { emitEntityEvent } from '../../../core/realtime.js';
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  getPurchaseOrderById,
  listPurchaseOrders,
  rowToPurchaseOrderApi,
  softDeletePurchaseOrder,
  submitPurchaseOrder,
  upsertPurchaseOrder,
} from '../services/purchaseOrderService.js';
import { getPurchaseOrderReportSummary } from '../services/purchaseOrderReportService.js';

export const purchaseOrdersRouter = Router();

const requireView = requirePermission('purchase_order.view');
const requireCreate = requirePermission('purchase_order.create');
const requireEdit = requirePermission('purchase_order.edit');
const requireApprove = requirePermission('purchase_order.approve');
const requireCancel = requirePermission('purchase_order.cancel');

purchaseOrdersRouter.get('/purchase-orders', requireView, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listPurchaseOrders(client, tenantId, {
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        vendorId: typeof req.query.vendorId === 'string' ? req.query.vendorId : undefined,
        projectId: typeof req.query.projectId === 'string' ? req.query.projectId : undefined,
      });
      sendSuccess(res, rows.map(rowToPurchaseOrderApi));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

purchaseOrdersRouter.get('/purchase-orders/report/summary', requireView, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const summary = await getPurchaseOrderReportSummary(client, tenantId);
      sendSuccess(res, summary);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

purchaseOrdersRouter.get('/purchase-orders/:id', requireView, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const po = await getPurchaseOrderById(client, tenantId, req.params.id);
      if (!po) {
        sendFailure(res, 404, 'NOT_FOUND', 'Purchase order not found');
        return;
      }
      sendSuccess(res, po);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

purchaseOrdersRouter.post('/purchase-orders', requireCreate, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const result = await withTransaction((client) =>
      upsertPurchaseOrder(client, tenantId, req.body as Record<string, unknown>, req.userId ?? null)
    );
    if (result.conflict) {
      sendVersionConflict(res, result.row.version);
      return;
    }
    const apiRow = rowToPurchaseOrderApi(result.row);
    emitEntityEvent(tenantId, result.wasInsert ? 'created' : 'updated', 'purchase_order', {
      data: apiRow,
      sourceUserId: req.userId,
    });
    sendSuccess(res, apiRow, result.wasInsert ? 201 : 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

purchaseOrdersRouter.post('/purchase-orders/:id/submit', requireEdit, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const body = req.body as Record<string, unknown>;
  const expectedVersion = typeof body.version === 'number' ? body.version : undefined;
  try {
    const result = await withTransaction((client) =>
      submitPurchaseOrder(client, tenantId, req.params.id, expectedVersion, req.userId ?? null, req.role ?? null)
    );
    if (result.conflict) {
      sendVersionConflict(res, result.serverVersion);
      return;
    }
    const apiRow = rowToPurchaseOrderApi(result.row);
    emitEntityEvent(tenantId, 'updated', 'purchase_order', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

purchaseOrdersRouter.post('/purchase-orders/:id/approve', requireApprove, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const body = req.body as Record<string, unknown>;
  const expectedVersion = typeof body.version === 'number' ? body.version : undefined;
  try {
    const result = await withTransaction((client) =>
      approvePurchaseOrder(client, tenantId, req.params.id, expectedVersion, req.userId ?? null)
    );
    if (result.conflict) {
      sendVersionConflict(res, result.serverVersion);
      return;
    }
    const apiRow = rowToPurchaseOrderApi(result.row);
    emitEntityEvent(tenantId, 'updated', 'purchase_order', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

purchaseOrdersRouter.post('/purchase-orders/:id/cancel', requireCancel, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const body = req.body as Record<string, unknown>;
  const expectedVersion = typeof body.version === 'number' ? body.version : undefined;
  const reason = body.reason != null ? String(body.reason) : null;
  try {
    const result = await withTransaction((client) =>
      cancelPurchaseOrder(client, tenantId, req.params.id, reason, expectedVersion, req.userId ?? null)
    );
    if (result.conflict) {
      sendVersionConflict(res, result.serverVersion);
      return;
    }
    const apiRow = rowToPurchaseOrderApi(result.row);
    emitEntityEvent(tenantId, 'updated', 'purchase_order', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

purchaseOrdersRouter.delete('/purchase-orders/:id', requireEdit, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const versionRaw = req.query.version;
  const expectedVersion =
    typeof versionRaw === 'string' && versionRaw !== '' ? Number(versionRaw) : undefined;
  try {
    const result = await withTransaction((client) =>
      softDeletePurchaseOrder(client, tenantId, req.params.id, expectedVersion)
    );
    if (result.conflict) {
      sendVersionConflict(res, result.serverVersion ?? 0);
      return;
    }
    if (!result.ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Purchase order not found');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'purchase_order', { id: req.params.id, sourceUserId: req.userId });
    sendSuccess(res, { id: req.params.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});
