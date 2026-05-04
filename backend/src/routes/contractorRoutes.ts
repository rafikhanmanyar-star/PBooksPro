import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../db/pool.js';
import { emitEntityEvent } from '../core/realtime.js';
import {
  approveContractorBill,
  createContractorAdvance,
  createContractorBill,
  getContractorLedger,
  listContractorAdvances,
  previewFifoAdjustmentsForBill,
  rowAdvanceToApi,
  rowBillToApi,
  type AdjustmentInput,
} from '../services/contractorBillingService.js';

export const contractorRouter = Router();

function parseAdjustmentBody(raw: unknown): AdjustmentInput[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { adjustments?: unknown }).adjustments)) {
    throw new Error('Expected body.adjustments array.');
  }
  const arr = (raw as { adjustments: unknown[] }).adjustments;
  return arr.map((row, idx) => {
    if (!row || typeof row !== 'object') throw new Error(`adjustments[${idx}] must be an object.`);
    const o = row as Record<string, unknown>;
    const advanceId = String(o.advanceId ?? o.contractorAdvanceId ?? o.advance_id ?? '').trim();
    const amount =
      typeof o.amount === 'number' ? o.amount : typeof o.amount === 'string' ? parseFloat(o.amount) : NaN;
    if (!advanceId) throw new Error(`adjustments[${idx}].advanceId is required.`);
    if (!Number.isFinite(amount)) throw new Error(`adjustments[${idx}].amount must be numeric.`);
    return { advanceId, amount };
  });
}

contractorRouter.post('/contractor/advance', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const b = req.body as Record<string, unknown>;
  try {
    const row = await withTransaction((client) =>
      createContractorAdvance(
        client,
        tenantId,
        {
          contractorContactId: String(b.contractorContactId ?? '').trim(),
          advanceDate: String(b.advanceDate ?? b.date ?? '').trim(),
          amount: typeof b.amount === 'number' ? b.amount : parseFloat(String(b.amount ?? NaN)),
          cashAccountId: String(b.cashAccountId ?? '').trim(),
          advanceAssetAccountId: String(b.advanceAssetAccountId ?? '').trim(),
          projectId: (b.projectId as string | null | undefined) ?? null,
          description: (b.description as string | null | undefined) ?? null,
          reference: (b.reference as string | null | undefined) ?? null,
        },
        req.userId ?? null
      )
    );
    const api = rowAdvanceToApi(row);
    emitEntityEvent(tenantId, 'created', 'contractor_advance', { data: api, sourceUserId: req.userId });
    sendSuccess(res, api, 201);
  } catch (e) {
    handleRouteError(res, e);
  }
});

contractorRouter.post('/contractor/bill', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const b = req.body as Record<string, unknown>;
  try {
    const row = await withTransaction((client) =>
      createContractorBill(
        client,
        tenantId,
        {
          contractorContactId: String(b.contractorContactId ?? '').trim(),
          billNumber: (b.billNumber ?? b.bill_number) as string | null | undefined,
          billDate: String(b.billDate ?? b.bill_date ?? '').trim(),
          amount: typeof b.amount === 'number' ? b.amount : parseFloat(String(b.amount ?? NaN)),
          description: (b.description as string | null | undefined) ?? null,
          projectId: (b.projectId ?? b.project_id) as string | null | undefined,
          constructionExpenseAccountId: String(
            b.constructionExpenseAccountId ?? b.construction_expense_account_id ?? ''
          ).trim(),
          residualAccountId: String(b.residualAccountId ?? b.residual_account_id ?? '').trim(),
        },
        req.userId ?? null
      )
    );
    const api = rowBillToApi(row);
    emitEntityEvent(tenantId, 'created', 'contractor_bill', { data: api, sourceUserId: req.userId });
    sendSuccess(res, api, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('duplicate')) {
      sendFailure(res, 409, 'DUPLICATE', msg);
      return;
    }
    handleRouteError(res, e);
  }
});

contractorRouter.post('/contractor/bill/:billId/approve', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { billId } = req.params;
  try {
    const adjustments = parseAdjustmentBody(req.body);
    const body = req.body as Record<string, unknown>;
    const result = await withTransaction((client) =>
      approveContractorBill(client, tenantId, billId, adjustments, req.userId ?? null, {
        entryDate:
          typeof body.entryDate === 'string' ? body.entryDate : typeof body.entry_date === 'string'
            ? body.entry_date
            : undefined,
        reference: typeof body.reference === 'string' ? body.reference : null,
        description: typeof body.description === 'string' ? body.description : null,
        residualAccountId:
          typeof body.residualAccountId === 'string'
            ? body.residualAccountId
            : typeof body.residual_account_id === 'string'
              ? body.residual_account_id
              : null,
      })
    );
    const apiBill = rowBillToApi(result.bill);
    emitEntityEvent(tenantId, 'updated', 'contractor_bill', { data: apiBill, sourceUserId: req.userId });
    sendSuccess(res, { bill: apiBill, journalEntryId: result.journalEntryId });
  } catch (e) {
    handleRouteError(res, e);
  }
});

contractorRouter.get('/contractor/:contactId/advances', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { contactId } = req.params;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listContractorAdvances(client, tenantId, contactId);
      sendSuccess(res, rows.map(rowAdvanceToApi));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

contractorRouter.get('/contractor/:contactId/ledger', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { contactId } = req.params;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const ledger = await getContractorLedger(client, tenantId, contactId);
      sendSuccess(res, {
        advances: ledger.advances.map(rowAdvanceToApi),
        adjustments: ledger.adjustments,
        summary: ledger.summary,
      });
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

contractorRouter.get('/contractor/:contactId/auto-adjust-preview', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { contactId } = req.params;
  const amtRaw =
    typeof req.query.billAmount === 'string'
      ? req.query.billAmount
      : typeof req.query.amount === 'string'
        ? req.query.amount
        : '';
  const amt = parseFloat(amtRaw);
  if (!Number.isFinite(amt) || amt <= 0) {
    sendFailure(res, 400, 'BAD_REQUEST', 'Query billAmount (or amount) must be a positive number.');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const suggestions = await previewFifoAdjustmentsForBill(client, tenantId, contactId, amt);
      sendSuccess(res, { billAmount: amt, fifoAdjustments: suggestions });
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});
