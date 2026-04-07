import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../db/pool.js';
import { emitEntityEvent } from '../core/realtime.js';
import {
  createPayrollRun,
  deletePayrollRun,
  departmentStats,
  getDepartment,
  getEmployee,
  getPayrollRun,
  getPayslip,
  getTenantConfig,
  listDepartments,
  listEmployees,
  listEmployeesByDepartment,
  listGrades,
  listPayrollProjects,
  listPayrollRuns,
  listPayslipsByEmployee,
  listPayslipsByRun,
  migrateDepartmentNamesToIds,
  payPayslip,
  processPayrollRun,
  rowToDepartmentApi,
  rowToEmployeeApi,
  rowToGradeApi,
  rowToPayrollProjectApi,
  rowToPayrollRunApi,
  rowToPayslipApi,
  softDeleteDepartment,
  softDeleteEmployee,
  softDeletePayslip,
  updatePayrollRun,
  updatePayslipAmounts,
  updatePayrollSettings,
  updateTenantConfigDeductionTypes,
  updateTenantConfigEarningTypes,
  upsertDepartment,
  upsertEmployee,
  upsertGrade,
  upsertPayrollProject,
} from '../services/payrollService.js';

export const payrollRouter = Router();

// ── Departments ───────────────────────────────────────────────────────────────

payrollRouter.get('/payroll/departments', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const rows = await listDepartments(c, tenantId);
      sendSuccess(res, rows.map((r) => rowToDepartmentApi(r)));
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

payrollRouter.get('/payroll/departments/stats', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const stats = await departmentStats(c, tenantId);
      sendSuccess(res, stats);
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

payrollRouter.get('/payroll/departments/:id/employees', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const rows = await listEmployeesByDepartment(c, tenantId, id);
      sendSuccess(res, rows.map((r) => rowToEmployeeApi(r)));
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

payrollRouter.get('/payroll/departments/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const row = await getDepartment(c, tenantId, id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Not found');
        return;
      }
      const emps = await listEmployeesByDepartment(c, tenantId, id);
      sendSuccess(res, {
          ...rowToDepartmentApi(row),
          employees: emps.map((e) => ({
            id: e.id,
            name: e.name,
            email: e.email ?? undefined,
            designation: e.designation,
            grade: e.grade ?? undefined,
            status: e.status,
            photo: e.photo ?? undefined,
          })),
        },);
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

payrollRouter.post('/payroll/departments', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const row = await withTransaction((c) => upsertDepartment(c, tenantId, req.body as Record<string, unknown>, req.userId ?? null));
    const api = rowToDepartmentApi(row);
    emitEntityEvent(tenantId, 'updated', 'payroll_department', { data: api, sourceUserId: req.userId });
    sendSuccess(res, api, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

payrollRouter.put('/payroll/departments/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const row = await withTransaction((c) =>
      upsertDepartment(c, tenantId, { ...(req.body as object), id: req.params.id }, req.userId ?? null)
    );
    const api = rowToDepartmentApi(row);
    emitEntityEvent(tenantId, 'updated', 'payroll_department', { data: api, sourceUserId: req.userId });
    sendSuccess(res, api);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

payrollRouter.delete('/payroll/departments/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const ok = await withTransaction((c) => softDeleteDepartment(c, tenantId, req.params.id));
    if (!ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Not found');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'payroll_department', { id: req.params.id, sourceUserId: req.userId });
    sendSuccess(res, { id: req.params.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

payrollRouter.post('/payroll/departments/migrate', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const n = await withTransaction((c) => migrateDepartmentNamesToIds(c, tenantId));
    sendSuccess(res, { migrated_count: n });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

// ── Grades ────────────────────────────────────────────────────────────────────

payrollRouter.get('/payroll/grades', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const rows = await listGrades(c, tenantId);
      sendSuccess(res, rows.map((r) => rowToGradeApi(r)));
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

payrollRouter.post('/payroll/grades', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const row = await withTransaction((c) => upsertGrade(c, tenantId, req.body as Record<string, unknown>, req.userId ?? null));
    emitEntityEvent(tenantId, 'updated', 'payroll_grade', { data: rowToGradeApi(row), sourceUserId: req.userId });
    sendSuccess(res, rowToGradeApi(row), 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

payrollRouter.put('/payroll/grades/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const row = await withTransaction((c) =>
      upsertGrade(c, tenantId, { ...(req.body as object), id: req.params.id }, req.userId ?? null)
    );
    emitEntityEvent(tenantId, 'updated', 'payroll_grade', { data: rowToGradeApi(row), sourceUserId: req.userId });
    sendSuccess(res, rowToGradeApi(row));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

// ── Employees ─────────────────────────────────────────────────────────────────

payrollRouter.get('/payroll/employees', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const rows = await listEmployees(c, tenantId);
      sendSuccess(res, rows.map((r) => rowToEmployeeApi(r)));
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

payrollRouter.get('/payroll/employees/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const row = await getEmployee(c, tenantId, req.params.id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Not found');
        return;
      }
      sendSuccess(res, rowToEmployeeApi(row));
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

payrollRouter.post('/payroll/employees', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const row = await withTransaction((c) => upsertEmployee(c, tenantId, req.body as Record<string, unknown>, req.userId ?? null));
    const api = rowToEmployeeApi(row);
    emitEntityEvent(tenantId, 'created', 'payroll_employee', { data: api, sourceUserId: req.userId });
    sendSuccess(res, api, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

payrollRouter.put('/payroll/employees/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const row = await withTransaction((c) =>
      upsertEmployee(c, tenantId, { ...(req.body as object), id: req.params.id }, req.userId ?? null)
    );
    const api = rowToEmployeeApi(row);
    emitEntityEvent(tenantId, 'updated', 'payroll_employee', { data: api, sourceUserId: req.userId });
    sendSuccess(res, api);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

payrollRouter.delete('/payroll/employees/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const ok = await withTransaction((c) => softDeleteEmployee(c, tenantId, req.params.id));
    if (!ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Not found');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'payroll_employee', { id: req.params.id, sourceUserId: req.userId });
    sendSuccess(res, { id: req.params.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

payrollRouter.get('/payroll/employees/:employeeId/payslips', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const rows = await listPayslipsByEmployee(c, tenantId, req.params.employeeId);
      sendSuccess(res, rows.map((r) => rowToPayslipApi(r)));
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

// ── Runs & payslips ───────────────────────────────────────────────────────────

payrollRouter.get('/payroll/runs', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const rows = await listPayrollRuns(c, tenantId);
      sendSuccess(res, rows.map((r) => rowToPayrollRunApi(r)));
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

payrollRouter.get('/payroll/runs/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const row = await getPayrollRun(c, tenantId, req.params.id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Not found');
        return;
      }
      sendSuccess(res, rowToPayrollRunApi(row));
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

payrollRouter.post('/payroll/runs', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const row = await withTransaction((c) => createPayrollRun(c, tenantId, req.body as Record<string, unknown>, req.userId ?? null));
    const api = rowToPayrollRunApi(row);
    emitEntityEvent(tenantId, 'created', 'payroll_run', { data: api, sourceUserId: req.userId });
    sendSuccess(res, { ...api, processing_summary: {} }, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

payrollRouter.put('/payroll/runs/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const row = await withTransaction((c) => updatePayrollRun(c, tenantId, req.params.id, req.body as Record<string, unknown>));
    if (!row) {
      sendFailure(res, 404, 'NOT_FOUND', 'Not found');
      return;
    }
    emitEntityEvent(tenantId, 'updated', 'payroll_run', { data: rowToPayrollRunApi(row), sourceUserId: req.userId });
    sendSuccess(res, rowToPayrollRunApi(row));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

payrollRouter.post('/payroll/runs/:id/process', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const onlyEmployeeId =
      typeof body.employeeId === 'string'
        ? body.employeeId
        : typeof body.employee_id === 'string'
          ? body.employee_id
          : undefined;
    const result = await withTransaction((c) =>
      processPayrollRun(c, tenantId, req.params.id, onlyEmployeeId)
    );
    emitEntityEvent(tenantId, 'updated', 'payroll_run', { data: rowToPayrollRunApi(result.run), sourceUserId: req.userId });
    sendSuccess(res, {
        ...rowToPayrollRunApi(result.run),
        processing_summary: result.processing_summary,
      },);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

payrollRouter.delete('/payroll/runs/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const ok = await withTransaction((c) => deletePayrollRun(c, tenantId, req.params.id));
    if (!ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Not found');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'payroll_run', { id: req.params.id, sourceUserId: req.userId });
    sendSuccess(res, { message: 'Deleted' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

payrollRouter.get('/payroll/runs/:runId/payslips', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const rows = await listPayslipsByRun(c, tenantId, req.params.runId);
      sendSuccess(res, rows.map((r) => rowToPayslipApi(r)));
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

payrollRouter.get('/payroll/payslips/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const row = await getPayslip(c, tenantId, req.params.id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Not found');
        return;
      }
      sendSuccess(res, rowToPayslipApi(row));
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

payrollRouter.put('/payroll/payslips/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const row = await withTransaction((c) =>
      updatePayslipAmounts(c, tenantId, req.params.id, req.body as Record<string, unknown>)
    );
    if (!row) {
      sendFailure(res, 404, 'NOT_FOUND', 'Not found');
      return;
    }
    emitEntityEvent(tenantId, 'updated', 'payslip', { data: rowToPayslipApi(row), sourceUserId: req.userId });
    sendSuccess(res, rowToPayslipApi(row));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

payrollRouter.delete('/payroll/payslips/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const ok = await withTransaction((c) => softDeletePayslip(c, tenantId, req.params.id));
    if (!ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Not found');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'payslip', { id: req.params.id, sourceUserId: req.userId });
    sendSuccess(res, { id: req.params.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

payrollRouter.post('/payroll/payslips/:payslipId/pay', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const result = await withTransaction((c) =>
      payPayslip(c, tenantId, req.params.payslipId, req.body as Record<string, unknown>, req.userId ?? null)
    );
    emitEntityEvent(tenantId, 'updated', 'payslip', { data: rowToPayslipApi(result.payslip), sourceUserId: req.userId });
    emitEntityEvent(tenantId, 'created', 'transaction', { data: result.transaction, sourceUserId: req.userId });
    sendSuccess(res, { payslip: rowToPayslipApi(result.payslip), transaction: result.transaction },);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

// ── Types, settings, projects, salary components ────────────────────────────

payrollRouter.get('/payroll/earning-types', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const cfg = await getTenantConfig(c, tenantId);
      sendSuccess(res, cfg.earning_types);
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

payrollRouter.get('/payroll/deduction-types', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const cfg = await getTenantConfig(c, tenantId);
      sendSuccess(res, cfg.deduction_types);
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

payrollRouter.put('/payroll/earning-types', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const types = (req.body as { types?: unknown }).types;
    const row = await withTransaction((c) => updateTenantConfigEarningTypes(c, tenantId, types));
    emitEntityEvent(tenantId, 'updated', 'payroll_settings', { data: { scope: 'earning_types' }, sourceUserId: req.userId });
    sendSuccess(res, row.earning_types);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

payrollRouter.put('/payroll/deduction-types', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const types = (req.body as { types?: unknown }).types;
    const row = await withTransaction((c) => updateTenantConfigDeductionTypes(c, tenantId, types));
    emitEntityEvent(tenantId, 'updated', 'payroll_settings', { data: { scope: 'deduction_types' }, sourceUserId: req.userId });
    sendSuccess(res, row.deduction_types);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

payrollRouter.get('/payroll/settings', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const cfg = await getTenantConfig(c, tenantId);
      sendSuccess(res, {
          defaultAccountId: cfg.default_account_id,
          defaultCategoryId: cfg.default_category_id,
          defaultProjectId: cfg.default_project_id,
        },);
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

payrollRouter.put('/payroll/settings', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const row = await withTransaction((c) => updatePayrollSettings(c, tenantId, req.body as Record<string, unknown>));
    emitEntityEvent(tenantId, 'updated', 'payroll_settings', { data: { scope: 'defaults' }, sourceUserId: req.userId });
    sendSuccess(res, {
        defaultAccountId: row.default_account_id,
        defaultCategoryId: row.default_category_id,
        defaultProjectId: row.default_project_id,
      },);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

payrollRouter.get('/payroll/projects', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const c = await pool.connect();
    try {
      const rows = await listPayrollProjects(c, tenantId);
      sendSuccess(res, rows.map((r) => rowToPayrollProjectApi(r)));
    } finally {
      c.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

payrollRouter.post('/payroll/projects', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const row = await withTransaction((c) => upsertPayrollProject(c, tenantId, req.body as Record<string, unknown>, req.userId ?? null));
    emitEntityEvent(tenantId, 'created', 'payroll_project', { data: rowToPayrollProjectApi(row), sourceUserId: req.userId });
    sendSuccess(res, rowToPayrollProjectApi(row), 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

payrollRouter.put('/payroll/projects/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const row = await withTransaction((c) =>
      upsertPayrollProject(c, tenantId, { ...(req.body as object), id: req.params.id }, req.userId ?? null)
    );
    emitEntityEvent(tenantId, 'updated', 'payroll_project', { data: rowToPayrollProjectApi(row), sourceUserId: req.userId });
    sendSuccess(res, rowToPayrollProjectApi(row));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});
