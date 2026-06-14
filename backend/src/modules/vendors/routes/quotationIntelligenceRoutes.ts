import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { getPool } from '../../../db/pool.js';
import {
  compareVendorQuotations,
  getProcurementDashboardMetrics,
  listVendorPriceHistory,
  lookupQuotationItemRates,
} from '../../../services/quotationIntelligenceService.js';

export const quotationIntelligenceRouter = Router();

quotationIntelligenceRouter.get('/quotations/item-rates', async (req: AuthedRequest, res) => {
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
      const result = await lookupQuotationItemRates(client, tenantId, {
        vendorId,
        categoryId,
        itemName: req.query.itemName != null ? String(req.query.itemName) : undefined,
      });
      sendSuccess(res, result);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

quotationIntelligenceRouter.get('/quotations/comparison', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await compareVendorQuotations(client, tenantId, {
        projectId: req.query.projectId != null ? String(req.query.projectId) : undefined,
        buildingId: req.query.buildingId != null ? String(req.query.buildingId) : undefined,
        packageName: req.query.packageName != null ? String(req.query.packageName) : undefined,
        categoryId: req.query.categoryId != null ? String(req.query.categoryId) : undefined,
        itemName: req.query.itemName != null ? String(req.query.itemName) : undefined,
      });
      sendSuccess(res, rows);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

quotationIntelligenceRouter.get('/quotations/price-history', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listVendorPriceHistory(client, tenantId, {
        vendorId: req.query.vendorId != null ? String(req.query.vendorId) : undefined,
        categoryId: req.query.categoryId != null ? String(req.query.categoryId) : undefined,
        itemName: req.query.itemName != null ? String(req.query.itemName) : undefined,
        projectId: req.query.projectId != null ? String(req.query.projectId) : undefined,
        limit: req.query.limit != null ? Number(req.query.limit) : undefined,
      });
      sendSuccess(res, rows);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

quotationIntelligenceRouter.get('/procurement/dashboard-metrics', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const metrics = await getProcurementDashboardMetrics(client, tenantId);
      sendSuccess(res, metrics);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});
