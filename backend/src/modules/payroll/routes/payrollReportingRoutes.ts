import { Router } from 'express';
import { z } from 'zod';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { getPool } from '../../../db/pool.js';
import { dataScopeContextFromRequest } from '../../../auth/tenantRepositoryScope.js';
import {
  getPayrollAttendanceImpactReportEnriched,
  getPayrollJournalReport,
  getPayrollLeaveImpactReport,
  getPayrollLiabilityReport,
  getPayrollPaymentHistoryReport,
  getPayrollRegisterReport,
  getPayrollSummaryReport,
} from '../services/payroll/payrollReportingService.js';

export const payrollReportingRouter = Router();

const periodQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  departmentId: z.string().trim().optional(),
  employeeId: z.string().trim().optional(),
  status: z.string().trim().optional(),
  runId: z.string().trim().optional(),
  projectId: z.string().trim().optional(),
});

const dateRangeSchema = periodQuerySchema.extend({
  fromDate: z.string().trim().optional(),
  toDate: z.string().trim().optional(),
});

function parseFilters<T extends z.ZodTypeAny>(schema: T, query: unknown) {
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid query' };
  }
  return { ok: true as const, data: parsed.data };
}

payrollReportingRouter.get('/payroll/reports/register', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  const parsed = parseFilters(periodQuerySchema, req.query);
  if (!parsed.ok) return sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error);
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const scopeCtx = dataScopeContextFromRequest(req);
      const data = await getPayrollRegisterReport(c, tenantId, parsed.data, scopeCtx);
      sendSuccess(res, data);
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

payrollReportingRouter.get('/payroll/reports/payment-history', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  const parsed = parseFilters(dateRangeSchema, req.query);
  if (!parsed.ok) return sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error);
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const scopeCtx = dataScopeContextFromRequest(req);
      const data = await getPayrollPaymentHistoryReport(c, tenantId, parsed.data, scopeCtx);
      sendSuccess(res, data);
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

payrollReportingRouter.get('/payroll/reports/liability', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  const parsed = parseFilters(periodQuerySchema, req.query);
  if (!parsed.ok) return sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error);
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const scopeCtx = dataScopeContextFromRequest(req);
      const data = await getPayrollLiabilityReport(c, tenantId, parsed.data, scopeCtx);
      sendSuccess(res, data);
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

payrollReportingRouter.get('/payroll/reports/journal', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  const parsed = parseFilters(periodQuerySchema, req.query);
  if (!parsed.ok) return sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error);
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const scopeCtx = dataScopeContextFromRequest(req);
      const data = await getPayrollJournalReport(c, tenantId, parsed.data, scopeCtx);
      sendSuccess(res, data);
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

payrollReportingRouter.get('/payroll/reports/leave-impact', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  const parsed = parseFilters(periodQuerySchema, req.query);
  if (!parsed.ok) return sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error);
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const scopeCtx = dataScopeContextFromRequest(req);
      const data = await getPayrollLeaveImpactReport(c, tenantId, parsed.data, scopeCtx);
      sendSuccess(res, data);
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

payrollReportingRouter.get('/payroll/reports/summary', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  const parsed = parseFilters(periodQuerySchema, req.query);
  if (!parsed.ok) return sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error);
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const scopeCtx = dataScopeContextFromRequest(req);
      const data = await getPayrollSummaryReport(c, tenantId, parsed.data, scopeCtx);
      sendSuccess(res, data);
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

payrollReportingRouter.get('/payroll/reports/attendance-impact-v2', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  const parsed = z
    .object({
      month: z.coerce.number().int().min(1).max(12),
      year: z.coerce.number().int().min(2000).max(2100),
    })
    .safeParse(req.query);
  if (!parsed.success) {
    return sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid query');
  }
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const scopeCtx = dataScopeContextFromRequest(req);
      const data = await getPayrollAttendanceImpactReportEnriched(
        c,
        tenantId,
        parsed.data.month,
        parsed.data.year,
        scopeCtx
      );
      sendSuccess(res, data);
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});
