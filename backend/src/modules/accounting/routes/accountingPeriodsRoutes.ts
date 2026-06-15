import { Router } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { requireLedgerRole, requireOrgUserAdmin } from '../../../middleware/authMiddleware.js';
import { sendFailure, sendSuccess } from '../../../utils/apiResponse.js';
import { withTransaction } from '../../../db/pool.js';
import {
  createAccountingPeriod,
  getAccountingPeriodById,
  listAccountingPeriods,
  reopenAccountingPeriod,
  rowToAccountingPeriodApi,
} from '../services/accountingPeriodService.js';
import {
  closeAccountingPeriod,
  logAccountingPeriodOpened,
  logAccountingPeriodReopened,
} from '../services/fiscalPeriodCloseService.js';
import { emitEntityEvent, emitFinancialPosted } from '../../../core/realtime.js';

const openBodySchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

const closeBodySchema = z.object({
  selectedProjectId: z.string().optional(),
  performYearEndTransfer: z.boolean().optional(),
});

export const accountingPeriodsRouter = Router();

accountingPeriodsRouter.get('/accounting-periods', requireLedgerRole, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const rows = await withTransaction((client) => listAccountingPeriods(client, tenantId));
    sendSuccess(res, rows.map(rowToAccountingPeriodApi));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 500, 'SERVER_ERROR', msg);
  }
});

accountingPeriodsRouter.get('/accounting-periods/:id', requireLedgerRole, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const id = String(req.params.id ?? '');
  try {
    const row = await withTransaction((client) => getAccountingPeriodById(client, tenantId, id));
    if (!row) {
      sendFailure(res, 404, 'NOT_FOUND', 'Accounting period not found.');
      return;
    }
    sendSuccess(res, rowToAccountingPeriodApi(row));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 500, 'SERVER_ERROR', msg);
  }
});

accountingPeriodsRouter.post('/accounting-periods/open', requireLedgerRole, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const parsed = openBodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.message);
    return;
  }
  try {
    const result = await withTransaction(async (client) => {
      const row = await createAccountingPeriod(client, tenantId, parsed.data);
      await logAccountingPeriodOpened(client, tenantId, row.id, req.userId ?? null, {
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
      });
      return row;
    });
    const apiRow = rowToAccountingPeriodApi(result);
    emitEntityEvent(tenantId, 'created', 'accounting_period', {
      data: apiRow,
      id: apiRow.id,
      sourceUserId: req.userId,
    });
    sendSuccess(res, apiRow, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'PERIOD_ERROR', msg);
  }
});

accountingPeriodsRouter.post(
  '/accounting-periods/:id/close',
  requireLedgerRole,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const id = String(req.params.id ?? '');
    const parsed = closeBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.message);
      return;
    }
    try {
      const result = await withTransaction((client) =>
        closeAccountingPeriod(client, tenantId, id, {
          actorUserId: req.userId ?? null,
          selectedProjectId: parsed.data.selectedProjectId,
          performYearEndTransfer: parsed.data.performYearEndTransfer,
        })
      );
      const apiRow = rowToAccountingPeriodApi(result.period);
      emitEntityEvent(tenantId, 'updated', 'accounting_period', {
        data: apiRow,
        id: apiRow.id,
        sourceUserId: req.userId,
      });
      if (result.closingJournalEntryId) {
        emitFinancialPosted(tenantId, {
          journalEntryId: result.closingJournalEntryId,
          sourceModule: 'accounting_period_close',
          sourceId: id,
          sourceUserId: req.userId,
        });
      }
      if (result.yearEndTransferJournalEntryId) {
        emitFinancialPosted(tenantId, {
          journalEntryId: result.yearEndTransferJournalEntryId,
          sourceModule: 'accounting_period_year_end',
          sourceId: id,
          sourceUserId: req.userId,
        });
      }
      sendSuccess(res, {
        period: apiRow,
        closingJournalEntryId: result.closingJournalEntryId,
        yearEndTransferJournalEntryId: result.yearEndTransferJournalEntryId,
        totals: result.totals,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendFailure(res, 400, 'PERIOD_CLOSE_ERROR', msg);
    }
  }
);

accountingPeriodsRouter.post(
  '/accounting-periods/:id/reopen',
  requireOrgUserAdmin,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const id = String(req.params.id ?? '');
    try {
      const row = await withTransaction(async (client) => {
        const updated = await reopenAccountingPeriod(client, tenantId, id, req.userId ?? null);
        await logAccountingPeriodReopened(client, tenantId, id, req.userId ?? null, {
          startDate: String(updated.start_date).slice(0, 10),
          endDate: String(updated.end_date).slice(0, 10),
        });
        return updated;
      });
      const apiRow = rowToAccountingPeriodApi(row);
      emitEntityEvent(tenantId, 'updated', 'accounting_period', {
        data: apiRow,
        id: apiRow.id,
        sourceUserId: req.userId,
      });
      sendSuccess(res, apiRow);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendFailure(res, 400, 'PERIOD_REOPEN_ERROR', msg);
    }
  }
);
