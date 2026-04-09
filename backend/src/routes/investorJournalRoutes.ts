import { Router } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { requireLedgerRole } from '../middleware/authMiddleware.js';
import { withTransaction } from '../db/pool.js';
import { sendFailure, sendSuccess } from '../utils/apiResponse.js';
import {
  postInvestorContribution,
  postInvestorWithdrawal,
  postProfitAllocationToInvestor,
  postInterProjectEquityTransfer,
  fetchInvestorEquityLedger,
} from '../services/investorJournalPostingService.js';
import { emitEntityEvent } from '../core/realtime.js';

export const investorJournalRouter = Router();

const contributionSchema = z.object({
  entryDate: z.string().min(1),
  amount: z.number().positive(),
  cashAccountId: z.string().min(1),
  investorEquityAccountId: z.string().min(1),
  projectId: z.string().min(1),
  investorPartyId: z.string().nullable().optional(),
  description: z.string().optional(),
  reference: z.string().optional(),
});

const withdrawalSchema = contributionSchema.extend({
  skipBalanceCheck: z.boolean().optional(),
});

const profitAllocSchema = z.object({
  entryDate: z.string().min(1),
  amount: z.number().positive(),
  retainedEarningsAccountId: z.string().min(1),
  investorEquityAccountId: z.string().min(1),
  projectId: z.string().min(1),
  investorPartyId: z.string().nullable().optional(),
  description: z.string().optional(),
  reference: z.string().optional(),
});

const transferSchema = z.object({
  entryDate: z.string().min(1),
  amount: z.number().positive(),
  investorEquityAccountId: z.string().min(1),
  investorPartyId: z.string().nullable().optional(),
  sourceProjectId: z.string().min(1),
  destProjectId: z.string().min(1),
  cashAccountId: z.string().min(1),
  description: z.string().optional(),
});

function emitJournalCreated(tenantId: string, journalEntryId: string, userId: string | undefined) {
  emitEntityEvent(tenantId, 'created', 'payment', {
    data: { journalEntryId },
    id: journalEntryId,
    sourceUserId: userId,
  });
}

investorJournalRouter.post('/investor/journal/contribution', requireLedgerRole, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const parsed = contributionSchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.message);
    return;
  }
  const createdBy = req.userId ?? null;
  try {
    const result = await withTransaction((client) =>
      postInvestorContribution(client, tenantId, { ...parsed.data, createdBy })
    );
    emitJournalCreated(tenantId, result.journalEntryId, req.userId);
    sendSuccess(res, result, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'INVESTOR_JOURNAL_ERROR', msg);
  }
});

investorJournalRouter.post('/investor/journal/withdrawal', requireLedgerRole, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const parsed = withdrawalSchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.message);
    return;
  }
  const createdBy = req.userId ?? null;
  try {
    const result = await withTransaction((client) =>
      postInvestorWithdrawal(client, tenantId, { ...parsed.data, createdBy })
    );
    emitJournalCreated(tenantId, result.journalEntryId, req.userId);
    sendSuccess(res, result, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'INVESTOR_JOURNAL_ERROR', msg);
  }
});

investorJournalRouter.post('/investor/journal/profit-allocation', requireLedgerRole, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const parsed = profitAllocSchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.message);
    return;
  }
  const createdBy = req.userId ?? null;
  try {
    const result = await withTransaction((client) =>
      postProfitAllocationToInvestor(client, tenantId, { ...parsed.data, createdBy })
    );
    emitJournalCreated(tenantId, result.journalEntryId, req.userId);
    sendSuccess(res, result, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'INVESTOR_JOURNAL_ERROR', msg);
  }
});

investorJournalRouter.post('/investor/journal/inter-project-transfer', requireLedgerRole, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.message);
    return;
  }
  const createdBy = req.userId ?? null;
  try {
    const result = await withTransaction((client) =>
      postInterProjectEquityTransfer(client, tenantId, { ...parsed.data, createdBy })
    );
    emitJournalCreated(tenantId, result.outJournalEntryId, req.userId);
    emitJournalCreated(tenantId, result.inJournalEntryId, req.userId);
    sendSuccess(res, result, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'INVESTOR_JOURNAL_ERROR', msg);
  }
});

investorJournalRouter.get('/investor/journal/ledger', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const investorEquityAccountId =
    typeof req.query.investorEquityAccountId === 'string' ? req.query.investorEquityAccountId : '';
  if (!investorEquityAccountId) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'investorEquityAccountId is required');
    return;
  }
  const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined;
  const toDate = typeof req.query.toDate === 'string' ? req.query.toDate : undefined;
  const projectId =
    typeof req.query.projectId === 'string' ? req.query.projectId : ('all' as const);

  try {
    const { getPool } = await import('../db/pool.js');
    const pool = getPool();
    const client = await pool.connect();
    let rows;
    try {
      rows = await fetchInvestorEquityLedger(client, tenantId, investorEquityAccountId, {
        from: fromDate,
        to: toDate,
        projectId: projectId === 'all' ? 'all' : projectId,
      });
    } finally {
      client.release();
    }
    sendSuccess(res, rows);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'INVESTOR_LEDGER_ERROR', msg);
  }
});
