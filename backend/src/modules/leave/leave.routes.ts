import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../../utils/apiResponse.js';
import type { AuthedRequest } from '../../middleware/authMiddleware.js';
import { getPool } from '../../db/pool.js';
import { emitEntityEvent } from '../../core/realtime.js';
import { dataScopeContextFromRequest } from '../../auth/tenantRepositoryScope.js';
import { buildPaginatedResponse } from '../../utils/pagination/index.js';
import {
  LeaveConflictError,
  LeaveScopeError,
  LeaveValidationError,
} from './leave.errors.js';
import {
  approveLeaveRequest,
  cancelLeaveRequest,
  createLeaveRequest,
  createLeaveType,
  deleteLeaveRequest,
  deleteLeaveType,
  getEmployeeLeaveBalances,
  getLeaveDashboardCounts,
  getLeaveRequest,
  listLeaveBalances,
  listLeaveRequests,
  listLeaveTypes,
  rejectLeaveRequest,
  updateLeaveRequest,
  updateLeaveType,
} from './leave.service.js';
import {
  approveLeaveSchema,
  createLeaveRequestSchema,
  createLeaveTypeSchema,
  leaveBalanceListQuerySchema,
  leaveRequestListQuerySchema,
  rejectLeaveSchema,
  updateLeaveRequestSchema,
  updateLeaveTypeSchema,
} from './leave.validation.js';
import type { LeaveRequestListFilters, LeaveStatus } from './leave.types.js';

export const leaveRouter = Router();

function handleLeaveRouteError(res: Parameters<typeof handleRouteError>[0], e: unknown): void {
  if (e instanceof LeaveValidationError) {
    sendFailure(res, 400, e.code, e.message);
    return;
  }
  if (e instanceof LeaveScopeError) {
    sendFailure(res, 403, 'FORBIDDEN', e.message);
    return;
  }
  if (e instanceof LeaveConflictError) {
    sendFailure(res, 409, e.code, e.message);
    return;
  }
  handleRouteError(res, e);
}

function emitLeaveRequest(tenantId: string, action: 'created' | 'updated' | 'deleted', row: unknown, id: string, userId?: string | null) {
  emitEntityEvent(tenantId, action, 'leave_request', {
    data: row,
    id,
    sourceUserId: userId ?? undefined,
  });
}

function emitLeaveType(tenantId: string, action: 'created' | 'updated' | 'deleted', row: unknown, id: string, userId?: string | null) {
  emitEntityEvent(tenantId, action, 'leave_type', {
    data: row,
    id,
    sourceUserId: userId ?? undefined,
  });
}

function parseRequestFilters(query: Record<string, unknown>): LeaveRequestListFilters {
  const parsed = leaveRequestListQuerySchema.parse(query);
  return {
    employeeId: parsed.employeeId ?? parsed.employee_id,
    departmentId: parsed.departmentId ?? parsed.department_id,
    leaveTypeId: parsed.leaveTypeId ?? parsed.leave_type_id,
    status: parsed.status as LeaveStatus | undefined,
    fromDate: parsed.fromDate ?? parsed.from_date,
    toDate: parsed.toDate ?? parsed.to_date,
    page: parsed.page,
    limit: parsed.limit,
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

leaveRouter.get('/leaves/types', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      sendSuccess(res, await listLeaveTypes(c, tenantId));
    } finally {
      c.release();
    }
  } catch (e) {
    handleLeaveRouteError(res, e);
  }
});

leaveRouter.post('/leaves/types', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId ?? null;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const body = createLeaveTypeSchema.parse(req.body);
    const pool = getPool();
    const c = await pool.connect();
    try {
      const row = await createLeaveType(c, tenantId, body as Record<string, unknown>, userId);
      emitLeaveType(tenantId, 'created', row, row.id, userId);
      sendSuccess(res, row, 201);
    } finally {
      c.release();
    }
  } catch (e) {
    handleLeaveRouteError(res, e);
  }
});

leaveRouter.put('/leaves/types/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId ?? null;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const body = updateLeaveTypeSchema.parse(req.body);
    const pool = getPool();
    const c = await pool.connect();
    try {
      const row = await updateLeaveType(c, tenantId, req.params.id, body as Record<string, unknown>, userId);
      if (!row) return sendFailure(res, 404, 'NOT_FOUND', 'Not found');
      emitLeaveType(tenantId, 'updated', row, row.id, userId);
      sendSuccess(res, row);
    } finally {
      c.release();
    }
  } catch (e) {
    handleLeaveRouteError(res, e);
  }
});

leaveRouter.delete('/leaves/types/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId ?? null;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const ok = await deleteLeaveType(c, tenantId, req.params.id, userId);
      if (!ok) return sendFailure(res, 404, 'NOT_FOUND', 'Not found');
      emitLeaveType(tenantId, 'deleted', null, req.params.id, userId);
      sendSuccess(res, { deleted: true });
    } finally {
      c.release();
    }
  } catch (e) {
    handleLeaveRouteError(res, e);
  }
});

leaveRouter.get('/leaves/requests', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const filters = parseRequestFilters(req.query as Record<string, unknown>);
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      const dashboard = await getLeaveDashboardCounts(c, tenantId, todayIso(), scopeCtx);
      const list = await listLeaveRequests(c, tenantId, filters, scopeCtx);
      sendSuccess(res, { ...buildPaginatedResponse(list.items, list.total, list.page, list.limit), dashboard });
    } finally {
      c.release();
    }
  } catch (e) {
    handleLeaveRouteError(res, e);
  }
});

leaveRouter.get('/leaves/requests/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      const row = await getLeaveRequest(c, tenantId, req.params.id, scopeCtx);
      if (!row) return sendFailure(res, 404, 'NOT_FOUND', 'Not found');
      sendSuccess(res, row);
    } finally {
      c.release();
    }
  } catch (e) {
    handleLeaveRouteError(res, e);
  }
});

leaveRouter.post('/leaves/requests', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId ?? null;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const body = createLeaveRequestSchema.parse(req.body);
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      const row = await createLeaveRequest(c, tenantId, body as Record<string, unknown>, userId, scopeCtx);
      emitLeaveRequest(tenantId, 'created', row, row.id, userId);
      sendSuccess(res, row, 201);
    } finally {
      c.release();
    }
  } catch (e) {
    handleLeaveRouteError(res, e);
  }
});

leaveRouter.put('/leaves/requests/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId ?? null;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const body = updateLeaveRequestSchema.parse(req.body);
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      const row = await updateLeaveRequest(c, tenantId, req.params.id, body as Record<string, unknown>, userId, scopeCtx);
      if (!row) return sendFailure(res, 404, 'NOT_FOUND', 'Not found');
      emitLeaveRequest(tenantId, 'updated', row, row.id, userId);
      sendSuccess(res, row);
    } finally {
      c.release();
    }
  } catch (e) {
    handleLeaveRouteError(res, e);
  }
});

leaveRouter.delete('/leaves/requests/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId ?? null;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      const ok = await deleteLeaveRequest(c, tenantId, req.params.id, userId, scopeCtx);
      if (!ok) return sendFailure(res, 404, 'NOT_FOUND', 'Not found');
      emitLeaveRequest(tenantId, 'deleted', null, req.params.id, userId);
      sendSuccess(res, { deleted: true });
    } finally {
      c.release();
    }
  } catch (e) {
    handleLeaveRouteError(res, e);
  }
});

leaveRouter.post('/leaves/requests/:id/approve', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId ?? null;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const body = approveLeaveSchema.parse(req.body ?? {});
    const forceOverride = Boolean(body.forceOverride ?? body.force_override);
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const result = await approveLeaveRequest(c, tenantId, req.params.id, userId, scopeCtx, {
        forceOverride,
      });
      await c.query('COMMIT');
      emitLeaveRequest(tenantId, 'updated', result.request, result.request.id, userId);
      for (const attId of result.attendanceIds) {
        emitEntityEvent(tenantId, 'created', 'attendance_record', { id: attId, sourceUserId: userId ?? undefined });
      }
      sendSuccess(res, result.request);
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  } catch (e) {
    handleLeaveRouteError(res, e);
  }
});

leaveRouter.post('/leaves/requests/:id/reject', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId ?? null;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const body = rejectLeaveSchema.parse(req.body ?? {});
    const reason = (body.rejection_reason ?? body.rejectionReason ?? '').trim();
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      const row = await rejectLeaveRequest(c, tenantId, req.params.id, reason, userId, scopeCtx);
      if (!row) return sendFailure(res, 404, 'NOT_FOUND', 'Not found');
      emitLeaveRequest(tenantId, 'updated', row, row.id, userId);
      sendSuccess(res, row);
    } finally {
      c.release();
    }
  } catch (e) {
    handleLeaveRouteError(res, e);
  }
});

leaveRouter.post('/leaves/requests/:id/cancel', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId ?? null;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const result = await cancelLeaveRequest(c, tenantId, req.params.id, userId, scopeCtx);
      await c.query('COMMIT');
      emitLeaveRequest(tenantId, 'updated', result.request, result.request.id, userId);
      for (const attId of result.attendanceIds) {
        emitEntityEvent(tenantId, 'deleted', 'attendance_record', { id: attId, sourceUserId: userId ?? undefined });
      }
      sendSuccess(res, result.request);
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  } catch (e) {
    handleLeaveRouteError(res, e);
  }
});

leaveRouter.get('/leaves/balances', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const parsed = leaveBalanceListQuerySchema.parse(req.query);
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      const list = await listLeaveBalances(c, tenantId, {
        employeeId: parsed.employeeId ?? parsed.employee_id,
        departmentId: parsed.departmentId ?? parsed.department_id,
        year: parsed.year,
        page: parsed.page,
        limit: parsed.limit,
      }, scopeCtx);
      sendSuccess(res, buildPaginatedResponse(list.items, list.total, list.page, list.limit));
    } finally {
      c.release();
    }
  } catch (e) {
    handleLeaveRouteError(res, e);
  }
});

leaveRouter.get('/leaves/balances/:employeeId', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) return sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  try {
    const year = Number(req.query.year ?? new Date().getFullYear());
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      const rows = await getEmployeeLeaveBalances(c, tenantId, req.params.employeeId, year, scopeCtx);
      sendSuccess(res, { employee_id: req.params.employeeId, year, balances: rows });
    } finally {
      c.release();
    }
  } catch (e) {
    handleLeaveRouteError(res, e);
  }
});
