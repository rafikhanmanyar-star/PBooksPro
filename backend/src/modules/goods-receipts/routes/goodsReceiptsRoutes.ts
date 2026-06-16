import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError, sendVersionConflict } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../../../db/pool.js';
import { requirePermission } from '../../../middleware/rbacMiddleware.js';
import { emitEntityEvent } from '../../../core/realtime.js';
import {
  closeGoodsReceipt,
  getGoodsReceiptById,
  getPoReceiptContext,
  listGoodsReceipts,
  postGoodsReceipt,
  rowToGoodsReceiptApi,
  softDeleteGoodsReceipt,
  upsertGoodsReceipt,
} from '../services/goodsReceiptService.js';
import { getGoodsReceiptReportSummary } from '../services/goodsReceiptReportService.js';
import { rowToPurchaseOrderApi } from '../../purchase-orders/services/purchaseOrderService.js';

export const goodsReceiptsRouter = Router();

const requireView = requirePermission('goods_receipt.view');
const requireCreate = requirePermission('goods_receipt.create');
const requireEdit = requirePermission('goods_receipt.edit');
const requirePost = requirePermission('goods_receipt.post');
const requireClose = requirePermission('goods_receipt.close');

goodsReceiptsRouter.get('/goods-receipts', requireView, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listGoodsReceipts(client, tenantId, {
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        vendorId: typeof req.query.vendorId === 'string' ? req.query.vendorId : undefined,
        projectId: typeof req.query.projectId === 'string' ? req.query.projectId : undefined,
        purchaseOrderId:
          typeof req.query.purchaseOrderId === 'string' ? req.query.purchaseOrderId : undefined,
      });
      sendSuccess(res, rows);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

goodsReceiptsRouter.get('/goods-receipts/report/summary', requireView, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      sendSuccess(res, await getGoodsReceiptReportSummary(client, tenantId));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

goodsReceiptsRouter.get('/goods-receipts/po-context/:purchaseOrderId', requireView, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const ctx = await getPoReceiptContext(client, tenantId, req.params.purchaseOrderId);
      if (!ctx) {
        sendFailure(res, 404, 'NOT_FOUND', 'Purchase order not found');
        return;
      }
      sendSuccess(res, ctx);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

goodsReceiptsRouter.get('/goods-receipts/:id', requireView, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const row = await getGoodsReceiptById(client, tenantId, req.params.id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Goods receipt not found');
        return;
      }
      sendSuccess(res, row);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

goodsReceiptsRouter.post('/goods-receipts', requireCreate, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const result = await withTransaction((client) =>
      upsertGoodsReceipt(client, tenantId, req.body as Record<string, unknown>, req.userId ?? null)
    );
    if (result.conflict) {
      sendVersionConflict(res, result.serverVersion);
      return;
    }
    emitEntityEvent(tenantId, 'created', 'goods_receipt', {
      data: result.api,
      id: result.row.id,
      sourceUserId: req.userId,
      version: result.row.version,
    });
    sendSuccess(res, result.api);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

goodsReceiptsRouter.put('/goods-receipts/:id', requireEdit, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const body = { ...(req.body as Record<string, unknown>), id: req.params.id };
    const result = await withTransaction((client) =>
      upsertGoodsReceipt(client, tenantId, body, req.userId ?? null)
    );
    if (result.conflict) {
      sendVersionConflict(res, result.serverVersion);
      return;
    }
    emitEntityEvent(tenantId, 'updated', 'goods_receipt', {
      data: result.api,
      id: result.row.id,
      sourceUserId: req.userId,
      version: result.row.version,
    });
    sendSuccess(res, result.api);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

goodsReceiptsRouter.post('/goods-receipts/:id/post', requirePost, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const body = req.body as Record<string, unknown>;
  const expectedVersion = typeof body.version === 'number' ? body.version : undefined;
  try {
    const result = await withTransaction((client) =>
      postGoodsReceipt(client, tenantId, req.params.id, expectedVersion, req.userId ?? null)
    );
    if (result.conflict) {
      sendVersionConflict(res, result.serverVersion);
      return;
    }
    emitEntityEvent(tenantId, 'updated', 'goods_receipt', {
      data: result.api,
      id: result.row.id,
      sourceUserId: req.userId,
      version: result.row.version,
    });
    if (result.purchaseOrder) {
      emitEntityEvent(tenantId, 'updated', 'purchase_order', {
        data: rowToPurchaseOrderApi(result.purchaseOrder),
        id: result.purchaseOrder.id,
        sourceUserId: req.userId,
        version: result.purchaseOrder.version,
      });
    }
    sendSuccess(res, result.api);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

goodsReceiptsRouter.post('/goods-receipts/:id/close', requireClose, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const body = req.body as Record<string, unknown>;
  const expectedVersion = typeof body.version === 'number' ? body.version : undefined;
  try {
    const result = await withTransaction((client) =>
      closeGoodsReceipt(client, tenantId, req.params.id, expectedVersion, req.userId ?? null)
    );
    if (result.conflict) {
      sendVersionConflict(res, result.serverVersion);
      return;
    }
    emitEntityEvent(tenantId, 'updated', 'goods_receipt', {
      data: result.api,
      id: result.row.id,
      sourceUserId: req.userId,
      version: result.row.version,
    });
    sendSuccess(res, result.api);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

goodsReceiptsRouter.delete('/goods-receipts/:id', requireEdit, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const result = await withTransaction((client) =>
      softDeleteGoodsReceipt(client, tenantId, req.params.id, req.userId ?? null)
    );
    if (!result.deleted) {
      sendFailure(res, 404, 'NOT_FOUND', 'Goods receipt not found');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'goods_receipt', {
      id: req.params.id,
      sourceUserId: req.userId,
    });
    if (result.purchaseOrder) {
      emitEntityEvent(tenantId, 'updated', 'purchase_order', {
        data: rowToPurchaseOrderApi(result.purchaseOrder),
        id: result.purchaseOrder.id,
        sourceUserId: req.userId,
        version: result.purchaseOrder.version,
      });
    }
    sendSuccess(res, { deleted: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});
