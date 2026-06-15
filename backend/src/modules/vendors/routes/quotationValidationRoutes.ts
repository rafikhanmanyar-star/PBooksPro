import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../../../db/pool.js';
import {
  getQuotationComplianceMetrics,
  getQuotationReferenceForInput,
  recordQuotationPriceOverride,
  validateQuotationRate,
} from '../services/quotationValidationService.js';

export const quotationValidationRouter = Router();

quotationValidationRouter.post('/quotation-validation/validate', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const body = req.body as Record<string, unknown>;
  const vendorId = String(body.vendorId ?? body.vendor_id ?? '').trim();
  const categoryId = String(body.categoryId ?? body.category_id ?? '').trim();
  const transactionRate = Number(body.transactionRate ?? body.transaction_rate);
  if (!vendorId || !categoryId || !Number.isFinite(transactionRate)) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'vendorId, categoryId, and transactionRate are required.');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const result = await validateQuotationRate(client, tenantId, {
        vendorId,
        categoryId,
        transactionRate,
        unit: body.unit != null ? String(body.unit) : undefined,
        asOfDate: body.asOfDate != null ? String(body.asOfDate) : undefined,
      });
      sendSuccess(res, result);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

quotationValidationRouter.get('/quotation-validation/reference', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const vendorId = String(req.query.vendorId ?? req.query.vendor_id ?? '').trim();
  const categoryId = String(req.query.categoryId ?? req.query.category_id ?? '').trim();
  if (!vendorId || !categoryId) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'vendorId and categoryId are required.');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const ref = await getQuotationReferenceForInput(client, tenantId, {
        vendorId,
        categoryId,
        unit: req.query.unit != null ? String(req.query.unit) : undefined,
        asOfDate: req.query.asOfDate != null ? String(req.query.asOfDate) : undefined,
      });
      sendSuccess(res, ref ?? null);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

quotationValidationRouter.post('/quotation-validation/overrides', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const body = req.body as Record<string, unknown>;
  const sourceType = String(body.sourceType ?? body.source_type ?? '').trim();
  if (sourceType !== 'contract' && sourceType !== 'bill') {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'sourceType must be contract or bill.');
    return;
  }
  const sourceId = String(body.sourceId ?? body.source_id ?? '').trim();
  const vendorId = String(body.vendorId ?? body.vendor_id ?? '').trim();
  const transactionRate = Number(body.transactionRate ?? body.transaction_rate);
  if (!sourceId || !vendorId || !Number.isFinite(transactionRate)) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'sourceId, vendorId, and transactionRate are required.');
    return;
  }
  try {
    const row = await withTransaction((client) =>
      recordQuotationPriceOverride(
        client,
        tenantId,
        {
          quotationId: body.quotationId != null ? String(body.quotationId) : null,
          quotationReference:
            body.quotationReference != null ? String(body.quotationReference) : null,
          sourceType: sourceType as 'contract' | 'bill',
          sourceId,
          lineItemId: body.lineItemId != null ? String(body.lineItemId) : null,
          vendorId,
          categoryId: body.categoryId != null ? String(body.categoryId) : null,
          projectId: body.projectId != null ? String(body.projectId) : null,
          quotationRate:
            body.quotationRate != null ? Number(body.quotationRate) : null,
          transactionRate,
          varianceAmount: body.varianceAmount != null ? Number(body.varianceAmount) : null,
          variancePercentage:
            body.variancePercentage != null ? Number(body.variancePercentage) : null,
        },
        req.userId ?? null
      )
    );
    sendSuccess(res, row, 201);
  } catch (e) {
    handleRouteError(res, e);
  }
});

quotationValidationRouter.get('/quotation-validation/compliance', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const metrics = await getQuotationComplianceMetrics(client, tenantId, {
        dateFrom: req.query.dateFrom != null ? String(req.query.dateFrom) : undefined,
        dateTo: req.query.dateTo != null ? String(req.query.dateTo) : undefined,
        vendorId: req.query.vendorId != null ? String(req.query.vendorId) : undefined,
        projectId: req.query.projectId != null ? String(req.query.projectId) : undefined,
        categoryId: req.query.categoryId != null ? String(req.query.categoryId) : undefined,
      });
      sendSuccess(res, metrics);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});
