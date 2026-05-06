import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../db/pool.js';
import {
  getBillById,
  listBills,
  rowToBillApi,
  softDeleteBill,
  upsertBill,
} from '../services/billsService.js';
import {
  getContractorAdvanceById,
  rowAdvanceToApi,
} from '../services/contractorBillingService.js';
import { settleVendorBillsBatchWithAdvances } from '../services/vendorBillAdvanceSettleService.js';
import { emitEntityEvent } from '../core/realtime.js';

export const billsRouter = Router();

billsRouter.get('/bills', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  const propertyId = typeof req.query.propertyId === 'string' ? req.query.propertyId : undefined;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listBills(client, tenantId, { status, projectId, propertyId });
      sendSuccess(res, rows.map((r) => rowToBillApi(r)));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

billsRouter.get('/bills/:id', async (req: AuthedRequest, res) => {
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
      const row = await getBillById(client, tenantId, id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Bill not found');
        return;
      }
      sendSuccess(res, rowToBillApi(row));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

billsRouter.post('/bills', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const result = await withTransaction((client) =>
      upsertBill(client, tenantId, req.body as Record<string, unknown>, req.userId ?? null)
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user', { serverVersion: result.row.version });
      return;
    }
    const apiRow = rowToBillApi(result.row);
    const action = result.wasInsert ? 'created' : 'updated';
    emitEntityEvent(tenantId, action, 'bill', { data: apiRow, sourceUserId: req.userId });
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

/** POST settle vendor/supplier/service bills against prepaid advances (journal + clearance rows; remainder via bank on JE). */
billsRouter.post('/bills/settle-with-advances', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const body = req.body as Record<string, unknown>;
  try {
    const supplierContactId = String(body.supplierContactId ?? body.supplier_contact_id ?? '').trim();
    const paymentAccountId = String(body.paymentAccountId ?? body.payment_account_id ?? '').trim();
    const entryDate = String(body.entryDate ?? body.entry_date ?? '').trim();
    const billsRaw = body.bills;
    if (!Array.isArray(billsRaw) || billsRaw.length === 0) {
      sendFailure(res, 400, 'BAD_REQUEST', 'body.bills must be a non-empty array.');
      return;
    }
    const bills = billsRaw.map((row, idx) => {
      if (!row || typeof row !== 'object') throw new Error(`bills[${idx}] must be an object.`);
      const o = row as Record<string, unknown>;
      const adjustmentsRaw = Array.isArray(o.adjustments) ? o.adjustments : [];
      const adjustments = adjustmentsRaw.map((ar, j) => {
        if (!ar || typeof ar !== 'object') throw new Error(`bills[${idx}].adjustments[${j}] invalid`);
        const a = ar as Record<string, unknown>;
        const advanceId = String(a.advanceId ?? a.contractorAdvanceId ?? a.advance_id ?? '').trim();
        const amt =
          typeof a.amount === 'number' ? a.amount : typeof a.amount === 'string' ? parseFloat(a.amount) : NaN;
        if (!advanceId || !Number.isFinite(amt)) {
          throw new Error(`bills[${idx}].adjustments[${j}] needs advanceId and amount`);
        }
        if (amt <= 0) {
          throw new Error(`bills[${idx}].adjustments[${j}] amount must be positive`);
        }
        return { advanceId, amount: amt };
      });
      const cashAmount =
        typeof o.cashAmount === 'number' ? o.cashAmount : typeof o.cash_amount === 'number'
          ? o.cash_amount
          : typeof o.cashAmount === 'string'
            ? parseFloat(o.cashAmount)
            : typeof o.cash_amount === 'string'
              ? parseFloat(o.cash_amount)
              : NaN;
      const expenseAccountId = String(
        o.expenseAccountId ?? o.expense_account_id ?? ''
      ).trim();
      const billId = String(o.billId ?? o.id ?? '').trim();
      if (!billId) throw new Error(`bills[${idx}].billId required`);
      if (!Number.isFinite(cashAmount)) throw new Error(`bills[${idx}].cashAmount invalid`);
      if (!expenseAccountId) throw new Error(`bills[${idx}].expenseAccountId required`);
      return {
        billId,
        adjustments,
        cashAmount,
        expenseAccountId,
      };
    });

    const out = await withTransaction((client) =>
      settleVendorBillsBatchWithAdvances(client, tenantId, req.userId ?? null, {
        supplierContactId,
        paymentAccountId,
        entryDate,
        bills,
        reference: typeof body.reference === 'string' ? body.reference : null,
        description: typeof body.description === 'string' ? body.description : null,
        batchId:
          typeof body.batchId === 'string'
            ? body.batchId
            : typeof body.batch_id === 'string'
              ? body.batch_id
              : null,
      })
    );

    const pool = getPool();
    const c = await pool.connect();
    try {
      const apiBills = [];
      for (const row of bills) {
        const br = await getBillById(c, tenantId, row.billId);
        if (br) {
          apiBills.push(rowToBillApi(br));
          emitEntityEvent(tenantId, 'updated', 'bill', {
            data: rowToBillApi(br),
            sourceUserId: req.userId,
          });
        }
      }
      const emittedAdv = new Set<string>();
      for (const aid of out.touchedAdvanceIds) {
        if (emittedAdv.has(aid)) continue;
        emittedAdv.add(aid);
        const advRow = await getContractorAdvanceById(c, tenantId, aid);
        if (advRow) {
          emitEntityEvent(tenantId, 'updated', 'contractor_advance', {
            data: rowAdvanceToApi(advRow),
            sourceUserId: req.userId,
          });
        }
      }
      sendSuccess(res, { journalEntries: out.journalEntries, bills: apiBills });
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

billsRouter.put('/bills/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const body = { ...(req.body as Record<string, unknown>), id };
    const result = await withTransaction((client) =>
      upsertBill(client, tenantId, body, req.userId ?? null)
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user', { serverVersion: result.row.version });
      return;
    }
    const apiRow = rowToBillApi(result.row);
    const action = result.wasInsert ? 'created' : 'updated';
    emitEntityEvent(tenantId, action, 'bill', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
      sendFailure(res, 409, 'DUPLICATE', msg);
      return;
    }
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

billsRouter.delete('/bills/:id', async (req: AuthedRequest, res) => {
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
      softDeleteBill(client, tenantId, id, Number.isFinite(expectedVersion) ? expectedVersion : undefined)
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');
      return;
    }
    if (!result.ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Bill not found');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'bill', { id, sourceUserId: req.userId });
    sendSuccess(res, { id });
  } catch (e) {
    handleRouteError(res, e);
  }
});
