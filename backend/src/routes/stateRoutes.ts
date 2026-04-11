import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../db/pool.js';
import { getStateChanges } from '../services/stateChangesService.js';
import { getBulkAppState } from '../services/appStateBulkService.js';

export const stateRouter = Router();

/**
 * Full snapshot for one round-trip (same data as the client’s parallel GETs in loadState()).
 * Optional query: `?entities=accounts,contacts,projects` (camelCase or snake_case, comma-separated).
 */
stateRouter.get('/state/bulk', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const payload = await getBulkAppState(client, tenantId, req.query.entities);
      sendSuccess(res, payload);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /state/bulk' });
  }
});

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
