import { Router } from 'express';
import { z } from 'zod';
import { sendFailure, sendSuccess, handleRouteError, sendVersionConflict } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../../../db/pool.js';
import { requirePermission } from '../../../middleware/rbacMiddleware.js';
import { emitEntityEvent } from '../../../core/realtime.js';
import {
  buildQuotationComparisonMatrix,
  createComparisonSession,
} from '../services/quotationComparisonService.js';
import {
  approveQuotation,
  convertApprovedQuotationToPurchaseOrder,
  getComparisonSession,
  markPreferredQuotation,
} from '../services/quotationSelectionService.js';

export const procurementQuotationComparisonRouter = Router();

const requireCompare = requirePermission('procurement.quotations.compare');
const requireSelect = requirePermission('procurement.quotations.select');
const requireApprove = requirePermission('procurement.quotations.approve');

const comparisonFiltersSchema = z.object({
  projectId: z.string().optional(),
  buildingId: z.string().optional(),
  packageName: z.string().optional(),
  categoryId: z.string().optional(),
  itemName: z.string().optional(),
});

procurementQuotationComparisonRouter.get(
  '/procurement/quotations/comparison',
  requireCompare,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      const filters = comparisonFiltersSchema.parse({
        projectId: req.query.projectId != null ? String(req.query.projectId) : undefined,
        buildingId: req.query.buildingId != null ? String(req.query.buildingId) : undefined,
        packageName: req.query.packageName != null ? String(req.query.packageName) : undefined,
        categoryId: req.query.categoryId != null ? String(req.query.categoryId) : undefined,
        itemName: req.query.itemName != null ? String(req.query.itemName) : undefined,
      });
      const pool = getPool();
      const client = await pool.connect();
      try {
        const matrix = await buildQuotationComparisonMatrix(client, tenantId, filters);
        const recommended = matrix.find((r) => r.isRecommended) ?? null;
        sendSuccess(res, { matrix, recommended });
      } finally {
        client.release();
      }
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

procurementQuotationComparisonRouter.post(
  '/procurement/quotations/comparison/sessions',
  requireCompare,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const body = req.body as Record<string, unknown>;
    try {
      const result = await withTransaction((client) =>
        createComparisonSession(client, tenantId, {
          title: body.title != null ? String(body.title) : undefined,
          projectId: body.projectId != null ? String(body.projectId) : undefined,
          buildingId: body.buildingId != null ? String(body.buildingId) : undefined,
          packageName: body.packageName != null ? String(body.packageName) : undefined,
          categoryId: body.categoryId != null ? String(body.categoryId) : undefined,
          itemName: body.itemName != null ? String(body.itemName) : undefined,
          quotationIds: Array.isArray(body.quotationIds)
            ? body.quotationIds.map((id) => String(id))
            : undefined,
          createdBy: req.userId ?? null,
        })
      );
      emitEntityEvent(tenantId, 'created', 'quotation', {
        data: result.session,
        sourceUserId: req.userId,
      });
      sendSuccess(res, result, 201);
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

procurementQuotationComparisonRouter.get(
  '/procurement/quotations/comparison/sessions/:id',
  requireCompare,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const session = await getComparisonSession(client, tenantId, req.params.id);
        if (!session) {
          sendFailure(res, 404, 'NOT_FOUND', 'Comparison session not found');
          return;
        }
        sendSuccess(res, session);
      } finally {
        client.release();
      }
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

procurementQuotationComparisonRouter.post(
  '/procurement/quotations/comparison/sessions/:id/prefer',
  requireSelect,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const body = req.body as Record<string, unknown>;
    const quotationId = String(body.quotationId ?? body.quotation_id ?? '').trim();
    if (!quotationId) {
      sendFailure(res, 400, 'VALIDATION_ERROR', 'quotationId is required.');
      return;
    }
    const expectedVersion =
      typeof body.version === 'number' ? body.version : undefined;
    try {
      const result = await withTransaction((client) =>
        markPreferredQuotation(
          client,
          tenantId,
          req.params.id,
          quotationId,
          expectedVersion,
          req.userId ?? null
        )
      );
      if (result.conflict) {
        sendVersionConflict(res, result.serverVersion);
        return;
      }
      emitEntityEvent(tenantId, 'updated', 'quotation', {
        data: result.session,
        sourceUserId: req.userId,
      });
      sendSuccess(res, result.session);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendFailure(res, 400, 'VALIDATION_ERROR', msg);
    }
  }
);

procurementQuotationComparisonRouter.post(
  '/procurement/quotations/:id/approve',
  requireApprove,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const body = req.body as Record<string, unknown>;
    const expectedVersion =
      typeof body.version === 'number' ? body.version : undefined;
    const sessionId =
      body.sessionId != null ? String(body.sessionId) : undefined;
    try {
      const result = await withTransaction((client) =>
        approveQuotation(client, tenantId, req.params.id, {
          sessionId,
          expectedVersion,
          userId: req.userId ?? null,
        })
      );
      if (result.conflict) {
        sendVersionConflict(res, result.serverVersion);
        return;
      }
      emitEntityEvent(tenantId, 'updated', 'quotation', {
        data: result.quotation,
        sourceUserId: req.userId,
      });
      if (result.session) {
        emitEntityEvent(tenantId, 'updated', 'quotation', {
          data: result.session,
          sourceUserId: req.userId,
        });
      }
      sendSuccess(res, result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendFailure(res, 400, 'VALIDATION_ERROR', msg);
    }
  }
);

procurementQuotationComparisonRouter.post(
  '/procurement/quotations/:id/convert-to-po',
  requireApprove,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const body = req.body as Record<string, unknown>;
    const sessionId =
      body.sessionId != null ? String(body.sessionId) : undefined;
    try {
      const result = await withTransaction((client) =>
        convertApprovedQuotationToPurchaseOrder(client, tenantId, req.params.id, {
          sessionId,
          userId: req.userId ?? null,
          targetDeliveryDate:
            body.targetDeliveryDate != null ? String(body.targetDeliveryDate) : undefined,
          description: body.description != null ? String(body.description) : undefined,
        })
      );
      emitEntityEvent(tenantId, 'created', 'purchase_order', {
        data: result.purchaseOrder,
        sourceUserId: req.userId,
      });
      emitEntityEvent(tenantId, 'updated', 'quotation', {
        data: result.quotation,
        sourceUserId: req.userId,
      });
      if (result.session) {
        emitEntityEvent(tenantId, 'updated', 'quotation', {
          data: result.session,
          sourceUserId: req.userId,
        });
      }
      sendSuccess(res, result, 201);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendFailure(res, 400, 'VALIDATION_ERROR', msg);
    }
  }
);
