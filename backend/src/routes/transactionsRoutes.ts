import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../db/pool.js';
import {
  getTransactionById,
  listTransactions,
  rowToTransactionApi,
  softDeleteTransaction,
  updateTransaction,
  upsertTransaction,
  type ListTransactionFilters,
} from '../services/transactionsService.js';
import { getBillById, rowToBillApi } from '../services/billsService.js';
import { getInvoiceById, rowToInvoiceApi } from '../services/invoicesService.js';
import { emitEntityEvent } from '../core/realtime.js';
import { memoryCacheDeletePrefix } from '../utils/memoryCache.js';

export const transactionsRouter = Router();

async function emitRecalculatedInvoiceBillEvents(
  tenantId: string,
  userId: string | undefined,
  affectedInvoiceIds: string[],
  affectedBillIds: string[]
): Promise<void> {
  if (affectedInvoiceIds.length === 0 && affectedBillIds.length === 0) return;
  const pool = getPool();
  const c = await pool.connect();
  try {
    for (const iid of affectedInvoiceIds) {
      const invRow = await getInvoiceById(c, tenantId, iid);
      if (invRow) {
        emitEntityEvent(tenantId, 'updated', 'invoice', {
          data: rowToInvoiceApi(invRow),
          sourceUserId: userId,
        });
      }
    }
    for (const bid of affectedBillIds) {
      const billRow = await getBillById(c, tenantId, bid);
      if (billRow) {
        emitEntityEvent(tenantId, 'updated', 'bill', {
          data: rowToBillApi(billRow),
          sourceUserId: userId,
        });
      }
    }
  } finally {
    c.release();
  }
}

function parseListFilters(req: AuthedRequest): ListTransactionFilters {
  const q = req.query;
  const rentalInvoiceOnly =
    q.rentalInvoiceOnly === 'true' || q.rentalInvoiceOnly === '1' || q.rentalInvoicesOnly === 'true';
  const limitRaw = typeof q.limit === 'string' ? parseInt(q.limit, 10) : NaN;
  const offsetRaw = typeof q.offset === 'string' ? parseInt(q.offset, 10) : NaN;
  return {
    projectId: typeof q.projectId === 'string' ? q.projectId : undefined,
    startDate: typeof q.startDate === 'string' ? q.startDate : undefined,
    endDate: typeof q.endDate === 'string' ? q.endDate : undefined,
    type: typeof q.type === 'string' ? q.type : undefined,
    invoiceId: typeof q.invoiceId === 'string' ? q.invoiceId : undefined,
    ownerId: typeof q.ownerId === 'string' ? q.ownerId : undefined,
    propertyId: typeof q.propertyId === 'string' ? q.propertyId : undefined,
    rentalInvoiceOnly: rentalInvoiceOnly || undefined,
    limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
    offset: Number.isFinite(offsetRaw) ? offsetRaw : undefined,
    cursorDate: typeof q.cursorDate === 'string' ? q.cursorDate : undefined,
    cursorId: typeof q.cursorId === 'string' ? q.cursorId : undefined,
  };
}

transactionsRouter.get('/transactions', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listTransactions(client, tenantId, parseListFilters(req));
      sendSuccess(res, rows.map((r) => rowToTransactionApi(r)));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

transactionsRouter.get('/transactions/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  if (id === 'journal') {
    sendFailure(res, 404, 'NOT_FOUND', 'Not found');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const row = await getTransactionById(client, tenantId, id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Transaction not found');
        return;
      }
      sendSuccess(res, rowToTransactionApi(row));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

transactionsRouter.post('/transactions', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const result = await withTransaction((client) =>
      upsertTransaction(client, tenantId, req.body as Record<string, unknown>, req.userId ?? null)
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user', { serverVersion: result.row.version });
      return;
    }
    const apiRow = rowToTransactionApi(result.row);
    memoryCacheDeletePrefix(`rental_balances:${tenantId}:`);
    memoryCacheDeletePrefix(`rental_monthly:${tenantId}:`);
    const action = result.wasInsert ? 'created' : 'updated';
    emitEntityEvent(tenantId, action, 'transaction', { data: apiRow, sourceUserId: req.userId });
    await emitRecalculatedInvoiceBillEvents(
      tenantId,
      req.userId,
      result.affectedInvoiceIds,
      result.affectedBillIds
    );
    sendSuccess(res, apiRow, result.wasInsert ? 201 : 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
      sendFailure(res, 409, 'DUPLICATE', msg);
      return;
    }
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

transactionsRouter.put('/transactions/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  if (id === 'journal') {
    sendFailure(res, 404, 'NOT_FOUND', 'Not found');
    return;
  }
  try {
    const body = { ...(req.body as Record<string, unknown>), id };
    const result = await withTransaction((client) => updateTransaction(client, tenantId, id, body));
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');
      return;
    }
    if (!result.row) {
      sendFailure(res, 404, 'NOT_FOUND', 'Transaction not found');
      return;
    }
    const apiRow = rowToTransactionApi(result.row);
    memoryCacheDeletePrefix(`rental_balances:${tenantId}:`);
    memoryCacheDeletePrefix(`rental_monthly:${tenantId}:`);
    emitEntityEvent(tenantId, 'updated', 'transaction', { data: apiRow, sourceUserId: req.userId });
    await emitRecalculatedInvoiceBillEvents(
      tenantId,
      req.userId,
      result.affectedInvoiceIds,
      result.affectedBillIds
    );
    sendSuccess(res, apiRow);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

transactionsRouter.delete('/transactions/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  if (id === 'journal') {
    sendFailure(res, 404, 'NOT_FOUND', 'Not found');
    return;
  }
  const versionRaw = req.query.version;
  const expectedVersion =
    typeof versionRaw === 'string' && versionRaw !== '' ? Number(versionRaw) : undefined;

  try {
    const result = await withTransaction((client) =>
      softDeleteTransaction(client, tenantId, id, Number.isFinite(expectedVersion) ? expectedVersion : undefined)
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');
      return;
    }
    if (!result.ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Transaction not found');
      return;
    }
    memoryCacheDeletePrefix(`rental_balances:${tenantId}:`);
    memoryCacheDeletePrefix(`rental_monthly:${tenantId}:`);
    emitEntityEvent(tenantId, 'deleted', 'transaction', { id, sourceUserId: req.userId });
    const pool = getPool();
    const c = await pool.connect();
    try {
      if (result.recalculatedInvoiceId) {
        const invRow = await getInvoiceById(c, tenantId, result.recalculatedInvoiceId);
        if (invRow) {
          emitEntityEvent(tenantId, 'updated', 'invoice', {
            data: rowToInvoiceApi(invRow),
            sourceUserId: req.userId,
          });
        }
      }
      if (result.recalculatedBillId) {
        const billRow = await getBillById(c, tenantId, result.recalculatedBillId);
        if (billRow) {
          emitEntityEvent(tenantId, 'updated', 'bill', {
            data: rowToBillApi(billRow),
            sourceUserId: req.userId,
          });
        }
      }
    } finally {
      c.release();
    }
    sendSuccess(res, { id });
  } catch (e) {
    handleRouteError(res, e);
  }
});
