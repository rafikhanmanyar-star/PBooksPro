import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError, sendVersionConflict } from '../../../utils/apiResponse.js';
import { respondVersionConflict } from '../../../utils/versionConflict.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../../../db/pool.js';
import {
  getQuotationById,
  listQuotations,
  listQuotationsPage,
  rowToQuotationApi,
  softDeleteQuotation,
  upsertQuotation,
} from '../services/quotationsService.js';
import { emitEntityEvent } from '../../../core/realtime.js';
import { respondEntitySearchList } from '../../../services/search/index.js';

export const quotationsRouter = Router();

quotationsRouter.get('/quotations', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const vendorId = typeof req.query.vendorId === 'string' ? req.query.vendorId : undefined;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await respondEntitySearchList({
        query: req.query as Record<string, unknown>,
        res,
        sendSuccess,
        listAll: () =>
          listQuotations(client, tenantId).then((rows) =>
            vendorId ? rows.filter((r) => r.vendor_id === vendorId) : rows
          ),
        listPage: (params) => listQuotationsPage(client, tenantId, { ...params, vendorId }),
        mapRow: rowToQuotationApi,
      });
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

quotationsRouter.get('/quotations/:id', async (req: AuthedRequest, res) => {
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
      const row = await getQuotationById(client, tenantId, id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Quotation not found');
        return;
      }
      sendSuccess(res, rowToQuotationApi(row));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

quotationsRouter.post('/quotations', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const result = await withTransaction((client) =>
      upsertQuotation(client, tenantId, req.body as Record<string, unknown>, req.userId ?? null)
    );
    if (result.conflict) {
      sendVersionConflict(res, result.row.version);
      return;
    }
    const apiRow = rowToQuotationApi(result.row);
    const action = result.wasInsert ? 'created' : 'updated';
    emitEntityEvent(tenantId, action, 'quotation', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow, result.wasInsert ? 201 : 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

quotationsRouter.delete('/quotations/:id', async (req: AuthedRequest, res) => {
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
      softDeleteQuotation(client, tenantId, id, expectedVersion)
    );
    if (result.conflict) {
      await respondVersionConflict(res, async () => {
        const pool = getPool();
        const c = await pool.connect();
        try {
          return (await getQuotationById(c, tenantId, id))?.version;
        } finally {
          c.release();
        }
      });
      return;
    }
    if (!result.ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Quotation not found');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'quotation', { id, sourceUserId: req.userId });
    sendSuccess(res, { id });
  } catch (e) {
    handleRouteError(res, e);
  }
});
