import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../../utils/apiResponse.js';
import type { AuthedRequest } from '../../middleware/authMiddleware.js';
import { getPool } from '../../db/pool.js';
import { emitEntityEvent } from '../../core/realtime.js';
import { dataScopeContextFromRequest } from '../../auth/tenantRepositoryScope.js';
import { buildPaginatedResponse } from '../../utils/pagination/index.js';
import {
  AttendanceDuplicateError,
  AttendanceScopeError,
  toAttendanceDuplicateError,
} from './attendance.errors.js';
import {
  bulkCreateAttendance,
  createAttendance,
  deleteAttendance,
  getAttendance,
  getDashboardCounts,
  getMonthlySheet,
  listAttendance,
  updateAttendance,
} from './attendance.service.js';
import {
  bulkAttendanceSchema,
  createAttendanceSchema,
  listAttendanceQuerySchema,
  monthlySheetQuerySchema,
  updateAttendanceSchema,
} from './attendance.validation.js';
import type { AttendanceListFilters, AttendanceStatus } from './attendance.types.js';

export const attendanceRouter = Router();

function handleAttendanceRouteError(res: Parameters<typeof handleRouteError>[0], e: unknown): void {
  if (e instanceof AttendanceDuplicateError) {
    sendFailure(res, 409, 'DUPLICATE', e.message);
    return;
  }
  if (e instanceof AttendanceScopeError) {
    sendFailure(res, 403, 'FORBIDDEN', e.message);
    return;
  }
  const dupErr = toAttendanceDuplicateError(e);
  if (dupErr) {
    sendFailure(res, 409, 'DUPLICATE', dupErr.message);
    return;
  }
  handleRouteError(res, e);
}

function parseListFilters(query: Record<string, unknown>): AttendanceListFilters {
  const parsed = listAttendanceQuerySchema.parse(query);
  return {
    date: parsed.date,
    month: parsed.month,
    year: parsed.year,
    employeeId: parsed.employeeId ?? parsed.employee_id,
    departmentId: parsed.departmentId ?? parsed.department_id,
    status: parsed.status as AttendanceStatus | undefined,
    page: parsed.page,
    limit: parsed.limit,
  };
}

attendanceRouter.get('/attendance', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const filters = parseListFilters(req.query as Record<string, unknown>);
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      if (filters.date && !filters.employeeId && !filters.departmentId && !filters.status && !filters.month) {
        const dashboard = await getDashboardCounts(c, tenantId, filters.date, scopeCtx);
        const list = await listAttendance(c, tenantId, { ...filters, limit: filters.limit ?? 100 }, scopeCtx);
        sendSuccess(res, {
          ...buildPaginatedResponse(list.items, list.total, list.page, list.limit),
          dashboard,
        });
        return;
      }
      const list = await listAttendance(c, tenantId, filters, scopeCtx);
      sendSuccess(res, buildPaginatedResponse(list.items, list.total, list.page, list.limit));
    } finally {
      c.release();
    }
  } catch (e) {
    handleAttendanceRouteError(res, e);
  }
});

attendanceRouter.get('/attendance/monthly-sheet', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const parsed = monthlySheetQuerySchema.parse(req.query);
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      const sheet = await getMonthlySheet(
        c,
        tenantId,
        parsed.year,
        parsed.month,
        parsed.departmentId ?? parsed.department_id,
        scopeCtx
      );
      sendSuccess(res, sheet);
    } finally {
      c.release();
    }
  } catch (e) {
    handleAttendanceRouteError(res, e);
  }
});

attendanceRouter.get('/attendance/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      const row = await getAttendance(c, tenantId, req.params.id, scopeCtx);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Not found');
        return;
      }
      sendSuccess(res, row);
    } finally {
      c.release();
    }
  } catch (e) {
    handleAttendanceRouteError(res, e);
  }
});

attendanceRouter.post('/attendance/bulk', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId ?? null;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const body = bulkAttendanceSchema.parse(req.body);
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const upserted = await bulkCreateAttendance(c, tenantId, body.date, body.records, userId, scopeCtx);
      await c.query('COMMIT');
      for (const { record, action } of upserted) {
        emitEntityEvent(tenantId, action === 'create' ? 'created' : 'updated', 'attendance_record', {
          data: record,
          id: record.id,
          sourceUserId: userId ?? undefined,
        });
      }
      const records = upserted.map((u) => u.record);
      sendSuccess(res, { records, count: records.length }, 201);
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  } catch (e) {
    handleAttendanceRouteError(res, e);
  }
});

attendanceRouter.post('/attendance', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId ?? null;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const body = createAttendanceSchema.parse(req.body);
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      const row = await createAttendance(c, tenantId, body as Record<string, unknown>, userId, scopeCtx);
      emitEntityEvent(tenantId, 'created', 'attendance_record', {
        data: row,
        id: row.id,
        sourceUserId: userId ?? undefined,
      });
      sendSuccess(res, row, 201);
    } finally {
      c.release();
    }
  } catch (e) {
    handleAttendanceRouteError(res, e);
  }
});

attendanceRouter.put('/attendance/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId ?? null;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const body = updateAttendanceSchema.parse(req.body);
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      const row = await updateAttendance(c, tenantId, req.params.id, body as Record<string, unknown>, userId, scopeCtx);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Not found');
        return;
      }
      emitEntityEvent(tenantId, 'updated', 'attendance_record', {
        data: row,
        id: row.id,
        sourceUserId: userId ?? undefined,
      });
      sendSuccess(res, row);
    } finally {
      c.release();
    }
  } catch (e) {
    handleAttendanceRouteError(res, e);
  }
});

attendanceRouter.delete('/attendance/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId ?? null;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const scopeCtx = dataScopeContextFromRequest(req);
    const pool = getPool();
    const c = await pool.connect();
    try {
      const ok = await deleteAttendance(c, tenantId, req.params.id, userId, scopeCtx);
      if (!ok) {
        sendFailure(res, 404, 'NOT_FOUND', 'Not found');
        return;
      }
      emitEntityEvent(tenantId, 'deleted', 'attendance_record', {
        id: req.params.id,
        sourceUserId: userId ?? undefined,
      });
      sendSuccess(res, { deleted: true });
    } finally {
      c.release();
    }
  } catch (e) {
    handleAttendanceRouteError(res, e);
  }
});
