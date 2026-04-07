import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { withTransaction } from '../db/pool.js';
import { getStateChanges } from '../services/stateChangesService.js';

export const stateRouter = Router();

/** Incremental sync: vendors, contacts, contracts, budgets, rental_agreements, project_agreements, plan_amenities, installment_plans, pm_cycle_allocations, invoices, bills, accounts, transactions, categories, recurring_invoice_templates, projects, buildings, properties, units, personal_categories, personal_transactions, payroll_* + payslips + app_settings changed since `since` (ISO8601). */
stateRouter.get('/state/changes', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const sinceRaw = typeof req.query.since === 'string' ? req.query.since : '';
  try {
    const payload = await withTransaction((c) => getStateChanges(c, tenantId, sinceRaw));
    sendSuccess(res, payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});
