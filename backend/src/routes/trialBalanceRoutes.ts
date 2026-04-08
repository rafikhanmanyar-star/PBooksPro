import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getTrialBalanceReportPayload } from '../services/trialBalanceReportService.js';
import type { TrialBalanceBasis } from '../financial/trialBalanceCore.js';

export const trialBalanceRouter = Router();

/**
 * GET /api/reports/trial-balance?from=YYYY-MM-DD&to=YYYY-MM-DD&basis=period|cumulative
 * Canonical trial balance for double-entry journal (journal_lines + journal_entries).
 */
trialBalanceRouter.get('/reports/trial-balance', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }

  const fromRaw = req.query.from ?? req.query.fromDate;
  const toRaw = req.query.to ?? req.query.toDate;
  const from = typeof fromRaw === 'string' ? fromRaw.trim() : '';
  const to = typeof toRaw === 'string' ? toRaw.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    sendFailure(res, 400, 'BAD_REQUEST', 'Query parameters from and to (YYYY-MM-DD) are required.');
    return;
  }

  const basisRaw = typeof req.query.basis === 'string' ? req.query.basis.trim().toLowerCase() : 'period';
  const basis: TrialBalanceBasis = basisRaw === 'cumulative' ? 'cumulative' : 'period';

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const data = await getTrialBalanceReportPayload(client, tenantId, { from, to, basis });
      sendSuccess(res, {
        from: data.from,
        to: data.to,
        basis: data.basis,
        accounts: data.accounts.map((a) => ({
          id: a.accountId,
          name: a.accountName,
          code: a.accountCode,
          type: a.accountType,
          sub_type: a.subType,
          parent_id: a.parentAccountId,
          is_active: a.isActive,
          gross_debit: a.grossDebit,
          gross_credit: a.grossCredit,
          net_balance: a.netBalance,
          debit: a.debit,
          credit: a.credit,
        })),
        totals: {
          total_debit: data.totals.totalDebit,
          total_credit: data.totals.totalCredit,
          gross_debit: data.totals.grossDebit,
          gross_credit: data.totals.grossCredit,
        },
        is_balanced: data.isBalanced,
      });
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});
