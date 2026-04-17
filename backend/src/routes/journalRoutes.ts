import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import { z } from 'zod';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { requireLedgerRole } from '../middleware/authMiddleware.js';
import { withTransaction } from '../db/pool.js';
import {
  createJournalEntry,
  getGeneralLedgerReport,
  getJournalWithLines,
  getTrialBalanceReport,
  isJournalReversed,
  reverseJournalEntry,
} from '../services/journalService.js';
import { emitEntityEvent } from '../core/realtime.js';

const lineSchema = z.object({
  accountId: z.string().min(1),
  debitAmount: z.number(),
  creditAmount: z.number(),
  projectId: z.string().nullable().optional(),
});

const investorTxnTypeEnum = z.enum(['investment', 'profit_allocation', 'withdrawal', 'transfer']);

const createBodySchema = z.object({
  entryDate: z.string().min(1),
  reference: z.string().optional(),
  description: z.string().nullable().optional(),
  sourceModule: z.string().nullable().optional(),
  sourceId: z.string().nullable().optional(),
  createdBy: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  investorId: z.string().nullable().optional(),
  investorTransactionType: investorTxnTypeEnum.nullable().optional(),
  lines: z.array(lineSchema).min(2),
});

export const journalRouter = Router();

journalRouter.post('/transactions/journal', requireLedgerRole, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const parsed = createBodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.message);
    return;
  }
  const body = parsed.data;
  const createdBy = body.createdBy ?? req.userId ?? null;
  try {
    const result = await withTransaction((client) =>
      createJournalEntry(client, tenantId, { ...body, createdBy })
    );
    emitEntityEvent(tenantId, 'created', 'payment', {
      data: { journalEntryId: result.journalEntryId },
      id: result.journalEntryId,
      sourceUserId: req.userId,
    });
    sendSuccess(res, result, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'JOURNAL_ERROR', msg);
  }
});

journalRouter.get('/transactions/journal/reports/trial-balance', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined;
  const toDate = typeof req.query.toDate === 'string' ? req.query.toDate : undefined;
  try {
    const { getPool } = await import('../db/pool.js');
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await getTrialBalanceReport(client, tenantId, { fromDate, toDate });
      sendSuccess(res, rows);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

journalRouter.get('/transactions/journal/reports/account/:accountId/ledger', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { accountId } = req.params;
  const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined;
  const toDate = typeof req.query.toDate === 'string' ? req.query.toDate : undefined;
  try {
    const { getPool } = await import('../db/pool.js');
    const pool = getPool();
    const client = await pool.connect();
    try {
      const data = await getGeneralLedgerReport(client, accountId, tenantId, { fromDate, toDate });
      sendSuccess(res, data);
    } finally {
      client.release();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes('not found') ? 404 : 500;
    sendFailure(res, status, status === 404 ? 'NOT_FOUND' : 'SERVER_ERROR', msg);
  }
});

journalRouter.get('/transactions/journal/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const { getPool } = await import('../db/pool.js');
    const pool = getPool();
    const client = await pool.connect();
    try {
      const data = await getJournalWithLines(client, id, tenantId);
      if (!data) {
        sendFailure(res, 404, 'NOT_FOUND', 'Journal entry not found');
        return;
      }
      const reversed = await isJournalReversed(client, id, tenantId);
      sendSuccess(res, { ...data, reversed });
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

const reverseBodySchema = z.object({
  reason: z.string().min(1),
});

journalRouter.post('/transactions/journal/:id/reverse', requireLedgerRole, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const parsed = reverseBodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'reason is required');
    return;
  }
  const { id } = req.params;
  const createdBy = req.userId ?? null;
  try {
    const result = await withTransaction((client) =>
      reverseJournalEntry(client, tenantId, id, parsed.data.reason, createdBy)
    );
    emitEntityEvent(tenantId, 'updated', 'payment', {
      data: { originalJournalEntryId: id, reversalJournalEntryId: result.reversalJournalEntryId },
      id,
      sourceUserId: req.userId,
    });
    sendSuccess(res, result, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'JOURNAL_ERROR', msg);
  }
});
