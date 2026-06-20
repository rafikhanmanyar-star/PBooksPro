import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getPool } from '../../../db/pool.js';
import { handleRouteError, sendFailure, sendSuccess } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { memoryCacheGet, memoryCacheSet } from '../../../utils/memoryCache.js';
import { dataScopeContextFromRequest } from '../../../auth/tenantRepositoryScope.js';
import {
  getBillSchedule,
  getConstructionReportingSummary,
  getOverdueVendorsReport,
  getPayableReport,
  getPaymentPerformance,
  getVendor360,
  getVendorLedgerPaginated,
  parseConstructionFilters,
} from '../services/constructionReportingService.js';
import type { ConstructionReportTab } from '../types/constructionReportingTypes.js';

export const constructionReportingRouter = Router();

const reportLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
const TTL_MS = 60_000;

function requireDates(filters: ReturnType<typeof parseConstructionFilters>, res: Parameters<typeof sendFailure>[0]): boolean {
  if (!filters.from || !filters.to) {
    sendFailure(res, 400, 'BAD_REQUEST', 'Query from and to (YYYY-MM-DD) are required.');
    return false;
  }
  return true;
}

constructionReportingRouter.get('/reports/construction-reporting/summary', reportLimiter, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) { sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
  const filters = parseConstructionFilters(req.query as Record<string, unknown>);
  if (!requireDates(filters, res)) return;
  const cacheKey = `construction_report_summary:${tenantId}:${JSON.stringify(filters)}`;
  const cached = memoryCacheGet<unknown>(cacheKey);
  if (cached) { sendSuccess(res, cached); return; }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const scopeCtx = dataScopeContextFromRequest(req);
      const payload = await getConstructionReportingSummary(client, tenantId, filters, scopeCtx);
      memoryCacheSet(cacheKey, payload, TTL_MS);
      sendSuccess(res, payload);
    } finally { client.release(); }
  } catch (e) { handleRouteError(res, e); }
});

constructionReportingRouter.get('/reports/construction-reporting/tab/:tab', reportLimiter, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) { sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
  const tab = req.params.tab as ConstructionReportTab;
  const valid: ConstructionReportTab[] = ['ledger', 'payable', 'overdue', 'schedule', 'payment-performance'];
  if (!valid.includes(tab)) { sendFailure(res, 400, 'BAD_REQUEST', `Unknown tab: ${tab}`); return; }
  const filters = parseConstructionFilters(req.query as Record<string, unknown>);
  if (!requireDates(filters, res)) return;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const scopeCtx = dataScopeContextFromRequest(req);
      let payload: unknown;
      switch (tab) {
        case 'ledger': payload = await getVendorLedgerPaginated(client, tenantId, filters, page, pageSize); break;
        case 'payable': payload = await getPayableReport(client, tenantId, filters, page, pageSize, scopeCtx); break;
        case 'overdue': payload = await getOverdueVendorsReport(client, tenantId, filters, page, pageSize, scopeCtx); break;
        case 'schedule': payload = await getBillSchedule(client, tenantId, filters, page, pageSize, scopeCtx); break;
        case 'payment-performance': payload = { rows: await getPaymentPerformance(client, tenantId, filters, scopeCtx) }; break;
      }
      sendSuccess(res, payload);
    } finally { client.release(); }
  } catch (e) { handleRouteError(res, e); }
});

constructionReportingRouter.get('/reports/construction-reporting/vendor/:vendorId', reportLimiter, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) { sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
  const vendorId = req.params.vendorId?.trim();
  if (!vendorId) { sendFailure(res, 400, 'BAD_REQUEST', 'vendorId is required'); return; }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const detail = await getVendor360(client, tenantId, vendorId);
      if (!detail) { sendFailure(res, 404, 'NOT_FOUND', 'Vendor not found'); return; }
      sendSuccess(res, detail);
    } finally { client.release(); }
  } catch (e) { handleRouteError(res, e); }
});
