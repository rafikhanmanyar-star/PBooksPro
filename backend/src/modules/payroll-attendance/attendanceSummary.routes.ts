import { Router } from 'express';
import { z } from 'zod';
import { sendFailure, sendSuccess, handleRouteError } from '../../utils/apiResponse.js';
import type { AuthedRequest } from '../../middleware/authMiddleware.js';
import { hasPermission } from '../../auth/permissionEvaluator.js';
import { resolveEnterpriseRole } from '../../auth/permissions.js';
import { getPool } from '../../db/pool.js';
import { emitEntityEvent } from '../../core/realtime.js';
import { dataScopeContextFromRequest } from '../../auth/tenantRepositoryScope.js';
import { buildPaginatedResponse } from '../../utils/pagination/index.js';
import {
  approvePayrollRunLifecycle,
  generateAttendanceSummaries,
  getWorkWeekConfig,
  listStoredAttendanceSummaries,
  monthNameFromNumber,
  PayrollAttendanceSummaryError,
  previewAttendanceSummaries,
  previewPayrollImpact,
  setPayrollRunProcessing,
  unapprovePayrollRunLifecycle,
  updateWorkWeekConfig,
} from './attendanceSummary.service.js';
import { createPayrollRun, getPayrollRun, rowToPayrollRunApi } from '../payroll/services/payrollService.js';

export const payrollAttendanceRouter = Router();

const periodQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(1900).max(3000),
  employeeId: z.string().optional(),
  employee_id: z.string().optional(),
  departmentId: z.string().optional(),
  department_id: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const generateBodySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(1900).max(3000),
  runId: z.string().optional(),
  run_id: z.string().optional(),
  forceOverride: z.boolean().optional(),
  force_override: z.boolean().optional(),
});

const workWeekSchema = z.object({
  working_days: z.array(z.coerce.number().int().min(0).max(6)).optional(),
  workingDays: z.array(z.coerce.number().int().min(0).max(6)).optional(),
  weekend_days: z.array(z.coerce.number().int().min(0).max(6)).optional(),
  weekendDays: z.array(z.coerce.number().int().min(0).max(6)).optional(),
});

function handleSummaryError(res: Parameters<typeof handleRouteError>[0], e: unknown): void {
  if (e instanceof PayrollAttendanceSummaryError) {
    const status =
      e.code === 'NOT_FOUND' ? 404 : e.code === 'FORBIDDEN' ? 403 : e.code === 'CONFLICT' ? 409 : 400;
    sendFailure(res, status, e.code, e.message);
    return;
  }
  handleRouteError(res, e);
}

payrollAttendanceRouter.get('/payroll/attendance-summaries/preview', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const parsed = periodQuerySchema.parse(req.query);
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      const items = await previewAttendanceSummaries(c, tenantId, parsed.month, parsed.year, scopeCtx);
      sendSuccess(res, { items, month: parsed.month, year: parsed.year });
    } finally {
      c.release();
    }
  } catch (e) {
    handleSummaryError(res, e);
  }
});

payrollAttendanceRouter.get('/payroll/attendance-summaries', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const parsed = periodQuerySchema.parse(req.query);
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      const list = await listStoredAttendanceSummaries(
        c,
        tenantId,
        {
          payrollMonth: parsed.month,
          payrollYear: parsed.year,
          employeeId: parsed.employeeId ?? parsed.employee_id,
          departmentId: parsed.departmentId ?? parsed.department_id,
          page: parsed.page,
          limit: parsed.limit,
        },
        scopeCtx
      );
      sendSuccess(res, buildPaginatedResponse(list.items, list.total, list.page, list.limit));
    } finally {
      c.release();
    }
  } catch (e) {
    handleSummaryError(res, e);
  }
});

payrollAttendanceRouter.post('/payroll/attendance-summaries/generate', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId ?? null;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const body = generateBodySchema.parse(req.body ?? {});
    const runId = body.runId ?? body.run_id ?? null;
    const forceOverride = body.forceOverride === true || body.force_override === true;
    if (forceOverride) {
      const enterpriseRole = resolveEnterpriseRole(req.role ?? '');
      if (!req.effectiveAccess || !hasPermission(req.effectiveAccess, 'payroll.write', enterpriseRole)) {
        sendFailure(res, 403, 'FORBIDDEN', 'Admin override requires payroll.write permission.');
        return;
      }
    }
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const result = await generateAttendanceSummaries(
        c,
        tenantId,
        body.month,
        body.year,
        userId,
        scopeCtx,
        runId,
        { forceOverride }
      );
      await c.query('COMMIT');
      emitEntityEvent(tenantId, 'updated', 'payroll_summary', {
        id: `${body.year}-${body.month}`,
        sourceUserId: userId ?? undefined,
      });
      if (result.runId) {
        emitEntityEvent(tenantId, 'updated', 'payroll_run', {
          id: result.runId,
          sourceUserId: userId ?? undefined,
        });
      }
      sendSuccess(res, result);
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  } catch (e) {
    handleSummaryError(res, e);
  }
});

payrollAttendanceRouter.get('/payroll/attendance-summaries/impact-preview', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const parsed = periodQuerySchema.parse(req.query);
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      const items = await previewPayrollImpact(c, tenantId, parsed.month, parsed.year, scopeCtx);
      sendSuccess(res, { items, month: parsed.month, year: parsed.year });
    } finally {
      c.release();
    }
  } catch (e) {
    handleSummaryError(res, e);
  }
});

payrollAttendanceRouter.get('/payroll/reports/attendance-impact', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const parsed = periodQuerySchema.parse(req.query);
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      const list = await listStoredAttendanceSummaries(
        c,
        tenantId,
        { payrollMonth: parsed.month, payrollYear: parsed.year, page: 1, limit: 500 },
        scopeCtx
      );
      sendSuccess(res, {
        report: 'attendance_impact',
        month: parsed.month,
        year: parsed.year,
        rows: list.items,
      });
    } finally {
      c.release();
    }
  } catch (e) {
    handleSummaryError(res, e);
  }
});

payrollAttendanceRouter.get('/payroll/reports/lop', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const parsed = periodQuerySchema.parse(req.query);
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      const list = await listStoredAttendanceSummaries(
        c,
        tenantId,
        { payrollMonth: parsed.month, payrollYear: parsed.year, page: 1, limit: 500 },
        scopeCtx
      );
      const rows = list.items
        .filter((r) => r.lop_days > 0)
        .map((r) => ({
          employee_id: r.employee_id,
          employee_name: r.employee_name,
          department: r.department,
          absent_days: r.absent_days,
          unpaid_leave_days: r.unpaid_leave_days,
          half_days: r.half_days,
          lop_days: r.lop_days,
        }));
      sendSuccess(res, {
        report: 'lop',
        month: parsed.month,
        year: parsed.year,
        rows,
        total_lop_days: rows.reduce((s, r) => s + r.lop_days, 0),
      });
    } finally {
      c.release();
    }
  } catch (e) {
    handleSummaryError(res, e);
  }
});

payrollAttendanceRouter.get('/payroll/settings/work-week', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const cfg = await getWorkWeekConfig(c, tenantId);
      sendSuccess(res, cfg);
    } finally {
      c.release();
    }
  } catch (e) {
    handleSummaryError(res, e);
  }
});

payrollAttendanceRouter.put('/payroll/settings/work-week', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId ?? null;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    workWeekSchema.parse(req.body ?? {});
    const pool = getPool();
    const c = await pool.connect();
    try {
      const cfg = await updateWorkWeekConfig(c, tenantId, req.body as Record<string, unknown>, userId);
      emitEntityEvent(tenantId, 'updated', 'payroll_settings', { id: tenantId, sourceUserId: userId ?? undefined });
      sendSuccess(res, cfg);
    } finally {
      c.release();
    }
  } catch (e) {
    handleSummaryError(res, e);
  }
});

payrollAttendanceRouter.post('/payroll/runs/wizard/start', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId ?? null;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const body = generateBodySchema.parse(req.body ?? {});
    const pool = getPool();
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const run = await createPayrollRun(
        c,
        tenantId,
        { month: monthNameFromNumber(body.month), year: body.year },
        userId
      );
      await setPayrollRunProcessing(c, tenantId, run.id, userId);
      await c.query('COMMIT');
      const refreshed = await getPayrollRun(c, tenantId, run.id);
      emitEntityEvent(tenantId, 'updated', 'payroll_run', { id: run.id, sourceUserId: userId ?? undefined });
      sendSuccess(res, rowToPayrollRunApi(refreshed ?? run));
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  } catch (e) {
    handleSummaryError(res, e);
  }
});

payrollAttendanceRouter.post('/payroll/runs/:id/approve', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId ?? null;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const result = await approvePayrollRunLifecycle(c, tenantId, req.params.id, userId, scopeCtx);
      await c.query('COMMIT');
      emitEntityEvent(tenantId, 'updated', 'payroll_run', { id: req.params.id, sourceUserId: userId ?? undefined });
      sendSuccess(res, result.run);
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  } catch (e) {
    handleSummaryError(res, e);
  }
});

payrollAttendanceRouter.post('/payroll/runs/:id/unapprove', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId ?? null;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const result = await unapprovePayrollRunLifecycle(c, tenantId, req.params.id, userId, scopeCtx);
      await c.query('COMMIT');
      emitEntityEvent(tenantId, 'updated', 'payroll_run', { id: req.params.id, sourceUserId: userId ?? undefined });
      sendSuccess(res, result.run);
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  } catch (e) {
    handleSummaryError(res, e);
  }
});
