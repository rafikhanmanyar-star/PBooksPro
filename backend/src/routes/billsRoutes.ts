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
import { reverseVendorBillAdvanceSettlement } from '../services/vendorBillAdvanceSettlementReverseService.js';
import { replaceVendorBillAdvanceSettlement } from '../services/vendorBillAdvanceReplaceService.js';
import { listVendorBillSettlementsForBills } from '../services/vendorBillSettlementReadService.js';
import { rowToTransactionApi } from '../services/transactionsService.js';
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

billsRouter.get('/bills/vendor-settlements', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const raw = typeof req.query.billIds === 'string' ? req.query.billIds : '';
  const billIds = raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (billIds.length === 0) {
    sendFailure(res, 400, 'BAD_REQUEST', 'Query billIds is required (comma-separated bill ids).');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listVendorBillSettlementsForBills(client, tenantId, billIds);
      sendSuccess(res, rows);
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
      for (const tx of out.cashExpenseTransactions) {
        emitEntityEvent(tenantId, 'created', 'transaction', {
          data: rowToTransactionApi(tx),
          sourceUserId: req.userId,
        });
      }
      sendSuccess(res, {
        journalEntries: out.journalEntries,
        bills: apiBills,
        transactions: out.cashExpenseTransactions.map((tx) => rowToTransactionApi(tx)),
      });
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

/** POST reverse vendor bill prepaid settlement: restore advances, unlink clearings, remove mirrored cash expense, reversing JE. */
billsRouter.post('/bills/vendor-settlement/reverse', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const body = req.body as Record<string, unknown>;
  const journalEntryId = String(body.journalEntryId ?? body.journal_entry_id ?? '').trim();
  const reason = String(body.reason ?? '').trim();
  try {
    const result = await withTransaction((client) =>
      reverseVendorBillAdvanceSettlement(client, tenantId, journalEntryId, reason, req.userId ?? null)
    );

    const pool = getPool();
    const c = await pool.connect();
    try {
      const emittedAdv = new Set<string>();
      for (const tid of result.deletedTransactionIds) {
        emitEntityEvent(tenantId, 'deleted', 'transaction', { id: tid, sourceUserId: req.userId });
      }
      for (const bid of result.billIds) {
        const br = await getBillById(c, tenantId, bid);
        if (br) {
          emitEntityEvent(tenantId, 'updated', 'bill', {
            data: rowToBillApi(br),
            sourceUserId: req.userId,
          });
        }
      }
      for (const aid of result.touchedAdvanceIds) {
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

      sendSuccess(res, {
        reversalJournalEntryId: result.reversalJournalEntryId,
        billIds: result.billIds,
        touchedAdvanceIds: result.touchedAdvanceIds,
        deletedTransactionIds: result.deletedTransactionIds,
      });
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

/** POST replace prepaid settlement for one bill (reverse prior JE + settle with new split). */
billsRouter.post('/bills/vendor-settlement/replace', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const body = req.body as Record<string, unknown>;
  try {
    const journalEntryId = String(body.journalEntryId ?? body.journal_entry_id ?? '').trim();
    const supplierContactId = String(body.supplierContactId ?? body.supplier_contact_id ?? '').trim();
    const paymentAccountId = String(body.paymentAccountId ?? body.payment_account_id ?? '').trim();
    const entryDate = String(body.entryDate ?? body.entry_date ?? '').trim();
    const billRaw = body.bill ?? body.payload;
    if (!billRaw || typeof billRaw !== 'object') {
      sendFailure(res, 400, 'BAD_REQUEST', 'body.bill object is required.');
      return;
    }

    const o = billRaw as Record<string, unknown>;
    const adjustmentsRaw = Array.isArray(o.adjustments) ? o.adjustments : [];
    const adjustments = adjustmentsRaw.map((ar, j) => {
      if (!ar || typeof ar !== 'object') throw new Error(`bill.adjustments[${j}] invalid`);
      const a = ar as Record<string, unknown>;
      const advanceId = String(a.advanceId ?? a.contractorAdvanceId ?? a.advance_id ?? '').trim();
      const amt =
        typeof a.amount === 'number' ? a.amount : typeof a.amount === 'string' ? parseFloat(a.amount) : NaN;
      if (!advanceId || !Number.isFinite(amt)) throw new Error(`bill.adjustments[${j}] needs advanceId and amount`);
      if (amt <= 0) throw new Error(`bill.adjustments[${j}] amount must be positive`);
      return { advanceId, amount: amt };
    });
    const cashAmount =
      typeof o.cashAmount === 'number'
        ? o.cashAmount
        : typeof o.cash_amount === 'number'
          ? o.cash_amount
          : typeof o.cashAmount === 'string'
            ? parseFloat(o.cashAmount)
            : typeof o.cash_amount === 'string'
              ? parseFloat(o.cash_amount)
              : NaN;
    const expenseAccountId = String(o.expenseAccountId ?? o.expense_account_id ?? '').trim();
    const billId = String(o.billId ?? o.id ?? '').trim();
    if (!billId) throw new Error('bill.billId required');
    if (!Number.isFinite(cashAmount)) throw new Error('bill.cashAmount invalid');
    if (!expenseAccountId) throw new Error('bill.expenseAccountId required');

    const bill = { billId, adjustments, cashAmount, expenseAccountId };

    const result = await withTransaction((client) =>
      replaceVendorBillAdvanceSettlement(client, tenantId, req.userId ?? null, {
        journalEntryId,
        supplierContactId,
        paymentAccountId,
        entryDate,
        bill,
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
      for (const tid of result.reverse.deletedTransactionIds) {
        emitEntityEvent(tenantId, 'deleted', 'transaction', { id: tid, sourceUserId: req.userId });
      }

      const emittedAdv = new Set<string>();
      for (const aid of result.reverse.touchedAdvanceIds) {
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

      for (const br of result.bills) {
        emitEntityEvent(tenantId, 'updated', 'bill', {
          data: rowToBillApi(br),
          sourceUserId: req.userId,
        });
      }

      for (const aid of result.settle.touchedAdvanceIds) {
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

      for (const tx of result.settle.cashExpenseTransactions) {
        emitEntityEvent(tenantId, 'created', 'transaction', {
          data: rowToTransactionApi(tx),
          sourceUserId: req.userId,
        });
      }

      sendSuccess(res, {
        bills: result.bills.map((b) => rowToBillApi(b)),
        reversalJournalEntryId: result.reverse.reversalJournalEntryId,
        deletedTransactionIds: result.reverse.deletedTransactionIds,
        journalEntries: result.settle.journalEntries,
        transactions: result.settle.cashExpenseTransactions.map((t) => rowToTransactionApi(t)),
      });
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
