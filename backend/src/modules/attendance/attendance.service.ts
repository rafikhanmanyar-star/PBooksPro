import type pg from 'pg';
import { randomUUID } from 'crypto';
import { recordDomainMutation } from '../../core/recordDomainMutation.js';
import type { DataScopeEnforcementContext } from '../../auth/tenantRepositoryScope.js';
import { rowMatchesScope } from '../../auth/tenantRepositoryScope.js';
import {
  AttendanceRepository,
  buildSummaryFromStatusCounts,
  daysInMonth,
  type AttendanceWriteFields,
} from './attendance.repository.js';
import {
  AttendanceDuplicateError,
  AttendanceScopeError,
  toAttendanceDuplicateError,
} from './attendance.errors.js';
import { PayrollEmployeeRepository } from '../payroll/repositories/PayrollEmployeeRepository.js';
import type {
  AttendanceDashboardCounts,
  AttendanceListFilters,
  AttendanceRecordApi,
  AttendanceRecordRow,
  AttendanceStatus,
  AttendanceSummaryApi,
  BulkAttendanceRecordInput,
  MonthlySheetEmployeeRow,
} from './attendance.types.js';
import { listEmployees } from '../payroll/services/payrollService.js';

export type BulkAttendanceUpsertResult = {
  record: AttendanceRecordApi;
  action: 'create' | 'update';
};

async function assertEmployeeDepartmentScope(
  client: pg.PoolClient,
  tenantId: string,
  employeeId: string,
  scopeCtx?: DataScopeEnforcementContext
): Promise<void> {
  if (!scopeCtx?.enabled) return;
  const empRepo = new PayrollEmployeeRepository(tenantId);
  const emp = await empRepo.getById(client, employeeId);
  if (!emp) {
    throw new Error('Employee not found.');
  }
  if (!rowMatchesScope(scopeCtx, 'department', emp.department_id)) {
    throw new AttendanceScopeError();
  }
}

function dateStr(d: Date | string | null | undefined): string {
  if (d == null) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function tsOrNull(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  if (d instanceof Date) return d.toISOString();
  return String(d);
}

function parseOptionalTs(v: unknown): Date | null {
  if (v == null || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function rowToAttendanceApi(row: AttendanceRecordRow & {
  employee_name?: string;
  employee_code?: string | null;
  department?: string;
  department_id?: string | null;
}): AttendanceRecordApi {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    employee_id: row.employee_id,
    attendance_date: dateStr(row.attendance_date),
    status: row.status as AttendanceStatus,
    check_in: tsOrNull(row.check_in),
    check_out: tsOrNull(row.check_out),
    late_minutes: Number(row.late_minutes) || 0,
    remarks: row.remarks ?? null,
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    employee_name: row.employee_name,
    employee_code: row.employee_code ?? undefined,
    department: row.department,
    department_id: row.department_id ?? undefined,
  };
}

function bodyToWriteFields(body: Record<string, unknown>, fallbackDate?: string): AttendanceWriteFields {
  const employee_id = String(body.employee_id ?? body.employeeId ?? '').trim();
  const attendance_date = String(body.attendance_date ?? body.attendanceDate ?? fallbackDate ?? '').slice(0, 10);
  const status = String(body.status ?? '').trim() as AttendanceStatus;
  if (!employee_id) throw new Error('employee_id is required.');
  if (!attendance_date) throw new Error('attendance_date is required.');
  if (!status) throw new Error('status is required.');
  return {
    employee_id,
    attendance_date,
    status,
    check_in: parseOptionalTs(body.check_in ?? body.checkIn),
    check_out: parseOptionalTs(body.check_out ?? body.checkOut),
    late_minutes: Number(body.late_minutes ?? body.lateMinutes ?? 0) || 0,
    remarks: body.remarks != null ? String(body.remarks) : null,
  };
}

async function auditAttendance(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  action: 'create' | 'update' | 'delete',
  userId: string | null | undefined,
  auditAction: string,
  prior?: AttendanceRecordRow | null,
  row?: AttendanceRecordRow | null
): Promise<void> {
  const repo = new AttendanceRepository(tenantId);
  const current =
    action === 'delete'
      ? prior ?? (await repo.getById(client, id))
      : row ?? (await repo.getById(client, id));
  await recordDomainMutation(client, {
    tenantId,
    userId: userId ?? null,
    module: 'attendance',
    entityType: 'attendance_record',
    entityId: id,
    action,
    auditAction,
    summary: `Attendance ${id} ${auditAction}`,
    newValue: current && action !== 'delete' ? rowToAttendanceApi(current) : undefined,
    oldValue: prior ? rowToAttendanceApi(prior) : current && action === 'delete' ? rowToAttendanceApi(current) : undefined,
  });
}

export async function listAttendance(
  client: pg.PoolClient,
  tenantId: string,
  filters: AttendanceListFilters,
  scopeCtx?: DataScopeEnforcementContext
): Promise<{ items: AttendanceRecordApi[]; total: number; page: number; limit: number }> {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 50;
  const { rows, total } = await new AttendanceRepository(tenantId).listFiltered(
    client,
    { ...filters, page, limit },
    scopeCtx
  );
  return { items: rows.map(rowToAttendanceApi), total, page, limit };
}

export async function getAttendance(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  scopeCtx?: DataScopeEnforcementContext
): Promise<AttendanceRecordApi | null> {
  const row = await new AttendanceRepository(tenantId).getById(client, id, scopeCtx);
  return row ? rowToAttendanceApi(row) : null;
}

export async function createAttendance(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  userId: string | null,
  scopeCtx?: DataScopeEnforcementContext
): Promise<AttendanceRecordApi> {
  const fields = bodyToWriteFields(body);
  await assertEmployeeDepartmentScope(client, tenantId, fields.employee_id, scopeCtx);
  const repo = new AttendanceRepository(tenantId);
  const dup = await repo.findActiveByEmployeeDate(client, fields.employee_id, fields.attendance_date);
  if (dup) {
    throw new AttendanceDuplicateError();
  }
  const id = `att_${randomUUID().replace(/-/g, '')}`;
  let row: AttendanceRecordRow;
  try {
    row = await repo.insertRecord(client, id, fields, userId);
  } catch (e) {
    const dupErr = toAttendanceDuplicateError(e);
    if (dupErr) throw dupErr;
    throw e;
  }
  await auditAttendance(client, tenantId, id, 'create', userId, 'attendance.created', null, row);
  const withEmp = await repo.getById(client, id);
  return rowToAttendanceApi(withEmp ?? row);
}

export async function updateAttendance(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>,
  userId: string | null,
  scopeCtx?: DataScopeEnforcementContext
): Promise<AttendanceRecordApi | null> {
  const repo = new AttendanceRepository(tenantId);
  const prior = await repo.getById(client, id, scopeCtx);
  if (!prior) return null;

  if (body.employee_id !== undefined || body.employeeId !== undefined) {
    const nextEmployeeId = String(body.employee_id ?? body.employeeId ?? prior.employee_id).trim();
    await assertEmployeeDepartmentScope(client, tenantId, nextEmployeeId, scopeCtx);
  }

  const updateFields: Partial<AttendanceWriteFields> = {};
  if (body.status !== undefined) updateFields.status = String(body.status) as AttendanceStatus;
  if (body.check_in !== undefined || body.checkIn !== undefined) {
    updateFields.check_in = parseOptionalTs(body.check_in ?? body.checkIn);
  }
  if (body.check_out !== undefined || body.checkOut !== undefined) {
    updateFields.check_out = parseOptionalTs(body.check_out ?? body.checkOut);
  }
  if (body.late_minutes !== undefined || body.lateMinutes !== undefined) {
    updateFields.late_minutes = Number(body.late_minutes ?? body.lateMinutes ?? 0) || 0;
  }
  if (body.remarks !== undefined) updateFields.remarks = body.remarks != null ? String(body.remarks) : null;

  const row = await repo.updateRecord(client, id, updateFields, userId);
  if (!row) return null;
  await auditAttendance(client, tenantId, id, 'update', userId, 'attendance.updated', prior, row);
  const withEmp = await repo.getById(client, id, scopeCtx);
  return rowToAttendanceApi(withEmp ?? row);
}

export async function deleteAttendance(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  userId: string | null,
  scopeCtx?: DataScopeEnforcementContext
): Promise<boolean> {
  const repo = new AttendanceRepository(tenantId);
  const prior = await repo.getById(client, id, scopeCtx);
  if (!prior) return false;
  const ok = await repo.markDeleted(client, id, userId);
  if (ok) await auditAttendance(client, tenantId, id, 'delete', userId, 'attendance.deleted', prior);
  return ok;
}

export async function bulkCreateAttendance(
  client: pg.PoolClient,
  tenantId: string,
  date: string,
  records: BulkAttendanceRecordInput[],
  userId: string | null,
  scopeCtx?: DataScopeEnforcementContext
): Promise<BulkAttendanceUpsertResult[]> {
  const repo = new AttendanceRepository(tenantId);
  const results: BulkAttendanceUpsertResult[] = [];
  for (const rec of records) {
    const fields = bodyToWriteFields(rec as unknown as Record<string, unknown>, date);
    await assertEmployeeDepartmentScope(client, tenantId, fields.employee_id, scopeCtx);
    const existing = await repo.findActiveByEmployeeDate(client, fields.employee_id, date);
    let row: AttendanceRecordRow;
    let action: 'create' | 'update' = 'create';
    let auditAction = 'attendance.created';
    let prior: AttendanceRecordRow | null = null;
    if (existing) {
      prior = existing;
      action = 'update';
      auditAction = 'attendance.updated';
      const updated = await repo.updateRecord(client, existing.id, {
        status: fields.status,
        check_in: fields.check_in,
        check_out: fields.check_out,
        late_minutes: fields.late_minutes,
        remarks: fields.remarks,
      }, userId);
      if (!updated) continue;
      row = updated;
    } else {
      const id = `att_${randomUUID().replace(/-/g, '')}`;
      try {
        row = await repo.insertRecord(client, id, fields, userId);
      } catch (e) {
        const dupErr = toAttendanceDuplicateError(e);
        if (dupErr) throw dupErr;
        throw e;
      }
      await auditAttendance(client, tenantId, row.id, action, userId, auditAction, null, row);
    }
    if (action === 'update') {
      await auditAttendance(client, tenantId, row.id, action, userId, auditAction, prior, row);
    }
    const withEmp = await repo.getById(client, row.id);
    results.push({ record: rowToAttendanceApi(withEmp ?? row), action });
  }
  return results;
}

export async function getDashboardCounts(
  client: pg.PoolClient,
  tenantId: string,
  date: string,
  scopeCtx?: DataScopeEnforcementContext
): Promise<AttendanceDashboardCounts> {
  const counts = await new AttendanceRepository(tenantId).countByStatusForDate(client, date, scopeCtx);
  const present = counts.PRESENT ?? 0;
  const absent = counts.ABSENT ?? 0;
  const leave = counts.LEAVE ?? 0;
  const late = counts.LATE ?? 0;
  const half = counts.HALF_DAY ?? 0;
  return {
    present,
    absent,
    leave,
    late,
    half_day: half,
    total_marked: present + absent + leave + late + half,
  };
}

export async function getMonthlySheet(
  client: pg.PoolClient,
  tenantId: string,
  year: number,
  month: number,
  departmentId: string | undefined,
  scopeCtx?: DataScopeEnforcementContext
): Promise<{ month: number; year: number; days_in_month: number; employees: MonthlySheetEmployeeRow[] }> {
  const repo = new AttendanceRepository(tenantId);
  const records = await repo.listForMonthSheet(client, year, month, departmentId, scopeCtx);
  const dim = daysInMonth(year, month);
  const byEmployee = new Map<string, MonthlySheetEmployeeRow>();

  const employees = await listEmployees(client, tenantId, scopeCtx);
  for (const emp of employees) {
    if (departmentId && emp.department_id !== departmentId) continue;
    byEmployee.set(emp.id, {
      employee_id: emp.id,
      employee_name: String(emp.name),
      employee_code: emp.employee_code ?? undefined,
      department: String(emp.department ?? ''),
      department_id: emp.department_id ?? undefined,
      days: {},
      summary: {
        working_days: dim,
        present_days: 0,
        absent_days: 0,
        leave_days: 0,
        late_days: 0,
        half_days: 0,
      },
    });
  }

  for (const rec of records) {
    const empId = rec.employee_id;
    if (!byEmployee.has(empId)) {
      byEmployee.set(empId, {
        employee_id: empId,
        employee_name: rec.employee_name ?? '',
        employee_code: rec.employee_code ?? undefined,
        department: rec.department ?? '',
        department_id: rec.department_id ?? undefined,
        days: {},
        summary: {
          working_days: dim,
          present_days: 0,
          absent_days: 0,
          leave_days: 0,
          late_days: 0,
          half_days: 0,
        },
      });
    }
    const row = byEmployee.get(empId)!;
    const dayNum = Number(dateStr(rec.attendance_date).slice(8, 10));
    row.days[String(dayNum)] = rec.status as AttendanceStatus;
  }

  for (const row of byEmployee.values()) {
    const statusRows = Object.values(row.days).filter(Boolean).map((s) => ({
      status: s as string,
      cnt: '1',
    }));
    row.summary = buildSummaryFromStatusCounts(statusRows, year, month);
  }

  return {
    month,
    year,
    days_in_month: dim,
    employees: Array.from(byEmployee.values()).sort((a, b) => a.employee_name.localeCompare(b.employee_name)),
  };
}

export async function summarizeEmployeeMonth(
  client: pg.PoolClient,
  tenantId: string,
  employeeId: string,
  year: number,
  month: number
): Promise<AttendanceSummaryApi> {
  return new AttendanceRepository(tenantId).summarizeForEmployeeMonth(client, employeeId, year, month);
}

export async function listAttendanceChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<AttendanceRecordApi[]> {
  const rows = await new AttendanceRepository(tenantId).listChangedSince(client, since);
  return rows.map(rowToAttendanceApi);
}
