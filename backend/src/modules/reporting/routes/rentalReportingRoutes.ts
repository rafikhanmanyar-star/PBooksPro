import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getPool } from '../../../db/pool.js';
import { handleRouteError, sendFailure, sendSuccess } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { memoryCacheGet, memoryCacheSet } from '../../../utils/memoryCache.js';
import {
  getRentalCollectionPerformance,
  getRentalReceivableReport,
  getRentalReportingSummary,
  getRentSchedule,
  getTenant360,
  getTenantDefaultersReport,
  getTenantLedgerPaginated,
  parseRentalFilters,
} from '../services/rentalReportingService.js';
import type { RentalReportTab } from '../types/rentalReportingTypes.js';

export const rentalReportingRouter = Router();

const reportLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
const TTL_MS = 60_000;

function requireDates(filters: ReturnType<typeof parseRentalFilters>, res: Parameters<typeof sendFailure>[0]): boolean {
  if (!filters.from || !filters.to) {
    sendFailure(res, 400, 'BAD_REQUEST', 'Query from and to (YYYY-MM-DD) are required.');
    return false;
  }
  return true;
}

rentalReportingRouter.get('/reports/rental-reporting/summary', reportLimiter, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) { sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
  const filters = parseRentalFilters(req.query as Record<string, unknown>);
  if (!requireDates(filters, res)) return;
  const cacheKey = `rental_report_summary:${tenantId}:${JSON.stringify(filters)}`;
  const cached = memoryCacheGet<unknown>(cacheKey);
  if (cached) { sendSuccess(res, cached); return; }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const payload = await getRentalReportingSummary(client, tenantId, filters);
      memoryCacheSet(cacheKey, payload, TTL_MS);
      sendSuccess(res, payload);
    } finally { client.release(); }
  } catch (e) { handleRouteError(res, e); }
});

rentalReportingRouter.get('/reports/rental-reporting/tab/:tab', reportLimiter, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) { sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
  const tab = req.params.tab as RentalReportTab;
  const valid: RentalReportTab[] = ['ledger', 'receivable', 'defaulters', 'schedule', 'collection-performance'];
  if (!valid.includes(tab)) { sendFailure(res, 400, 'BAD_REQUEST', `Unknown tab: ${tab}`); return; }
  const filters = parseRentalFilters(req.query as Record<string, unknown>);
  if (!requireDates(filters, res)) return;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      let payload: unknown;
      switch (tab) {
        case 'ledger': payload = await getTenantLedgerPaginated(client, tenantId, filters, page, pageSize); break;
        case 'receivable': payload = await getRentalReceivableReport(client, tenantId, filters, page, pageSize); break;
        case 'defaulters': payload = await getTenantDefaultersReport(client, tenantId, filters, page, pageSize); break;
        case 'schedule': payload = await getRentSchedule(client, tenantId, filters, page, pageSize); break;
        case 'collection-performance': payload = { rows: await getRentalCollectionPerformance(client, tenantId, filters) }; break;
      }
      sendSuccess(res, payload);
    } finally { client.release(); }
  } catch (e) { handleRouteError(res, e); }
});

rentalReportingRouter.get('/reports/rental-reporting/tenant/:contactId', reportLimiter, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) { sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
  const contactId = req.params.contactId?.trim();
  if (!contactId) { sendFailure(res, 400, 'BAD_REQUEST', 'contactId is required'); return; }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const detail = await getTenant360(client, tenantId, contactId);
      if (!detail) { sendFailure(res, 404, 'NOT_FOUND', 'Tenant not found'); return; }
      sendSuccess(res, detail);
    } finally { client.release(); }
  } catch (e) { handleRouteError(res, e); }
});
