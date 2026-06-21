import type pg from 'pg';
import { randomUUID } from 'crypto';
import { recordDomainMutation } from '../../core/recordDomainMutation.js';
import type { DataScopeEnforcementContext } from '../../auth/tenantRepositoryScope.js';
import { rowMatchesScope } from '../../auth/tenantRepositoryScope.js';
import { PayrollEmployeeRepository } from '../payroll/repositories/PayrollEmployeeRepository.js';
import { AttendanceRepository } from '../attendance/attendance.repository.js';
import { rowToAttendanceApi } from '../attendance/attendance.service.js';
import type { AttendanceRecordRow } from '../attendance/attendance.types.js';
import { toAttendanceDuplicateError } from '../attendance/attendance.errors.js';
import {
  LeaveRepository,
  calculateLeaveDays,
  enumerateLeaveDates,
  type LeaveTypeWriteFields,
} from './leave.repository.js';
import {
  LeaveAttendanceConflictError,
  LeaveConflictError,
  LeaveScopeError,
  LeaveValidationError,
} from './leave.errors.js';
import type {
  LeaveBalanceApi,
  LeaveBalanceListFilters,
  LeaveDashboardCounts,
  LeaveRequestApi,
  LeaveRequestListFilters,
  LeaveRequestRow,
  LeaveStatus,
  LeaveTypeApi,
  LeaveTypeRow,
} from './leave.types.js';

const DEFAULT_LEAVE_TYPES: Omit<LeaveTypeWriteFields, 'active'>[] = [
  { name: 'Annual Leave', annual_quota: 14, paid_leave: true, carry_forward: false },
  { name: 'Casual Leave', annual_quota: 10, paid_leave: true, carry_forward: false },
  { name: 'Sick Leave', annual_quota: 8, paid_leave: true, carry_forward: false },
  { name: 'Unpaid Leave', annual_quota: 0, paid_leave: false, carry_forward: false },
];

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

function num(v: string | number | null | undefined): number {
  return Number(v) || 0;
}

export function rowToLeaveTypeApi(row: LeaveTypeRow): LeaveTypeApi {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    annual_quota: Number(row.annual_quota),
    paid_leave: row.paid_leave,
    carry_forward: row.carry_forward,
    active: row.active,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export function rowToLeaveRequestApi(row: LeaveRequestRow & {
  employee_name?: string;
  employee_code?: string | null;
  department?: string;
  department_id?: string | null;
  leave_type_name?: string;
}): LeaveRequestApi {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    employee_id: row.employee_id,
    leave_type_id: row.leave_type_id,
    from_date: dateStr(row.from_date),
    to_date: dateStr(row.to_date),
    days: num(row.days),
    reason: row.reason ?? null,
    attachment_url: row.attachment_url ?? null,
    status: row.status as LeaveStatus,
    approved_by: row.approved_by,
    approved_at: tsOrNull(row.approved_at),
    rejection_reason: row.rejection_reason ?? null,
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    employee_name: row.employee_name,
    employee_code: row.employee_code ?? undefined,
    department: row.department,
    department_id: row.department_id ?? undefined,
    leave_type_name: row.leave_type_name,
  };
}

export function rowToLeaveBalanceApi(row: {
  id: string;
  tenant_id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  allocated_days: string | number;
  used_days: string | number;
  balance_days: string | number;
  employee_name?: string;
  department?: string;
  leave_type_name?: string;
}): LeaveBalanceApi {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    employee_id: row.employee_id,
    leave_type_id: row.leave_type_id,
    year: row.year,
    allocated_days: num(row.allocated_days),
    used_days: num(row.used_days),
    balance_days: num(row.balance_days),
    employee_name: row.employee_name,
    department: row.department,
    leave_type_name: row.leave_type_name,
  };
}

async function assertEmployeeDepartmentScope(
  client: pg.PoolClient,
  tenantId: string,
  employeeId: string,
  scopeCtx?: DataScopeEnforcementContext
): Promise<void> {
  if (!scopeCtx?.enabled) return;
  const emp = await new PayrollEmployeeRepository(tenantId).getById(client, employeeId);
  if (!emp) throw new LeaveValidationError('Employee not found.');
  if (!rowMatchesScope(scopeCtx, 'department', emp.department_id)) throw new LeaveScopeError();
}

async function auditLeave(
  client: pg.PoolClient,
  tenantId: string,
  entityType: 'leave_request' | 'leave_type' | 'leave_balance',
  entityId: string,
  action: 'create' | 'update' | 'delete',
  auditAction: string,
  userId: string | null | undefined,
  prior?: unknown,
  row?: unknown
): Promise<void> {
  await recordDomainMutation(client, {
    tenantId,
    userId: userId ?? null,
    module: 'leave',
    entityType,
    entityId,
    action,
    auditAction,
    summary: `Leave ${entityId} ${auditAction}`,
    newValue: row && action !== 'delete' ? row : undefined,
    oldValue: prior && action === 'delete' ? prior : prior,
  });
}

export async function ensureDefaultLeaveTypes(client: pg.PoolClient, tenantId: string): Promise<void> {
  const repo = new LeaveRepository(tenantId);
  const existing = await repo.listTypes(client);
  if (existing.length > 0) return;
  for (const def of DEFAULT_LEAVE_TYPES) {
    const id = `lvt_${randomUUID().replace(/-/g, '')}`;
    await repo.insertType(client, id, { ...def, active: true });
  }
}

export async function listLeaveTypes(client: pg.PoolClient, tenantId: string): Promise<LeaveTypeApi[]> {
  await ensureDefaultLeaveTypes(client, tenantId);
  const rows = await new LeaveRepository(tenantId).listTypes(client);
  return rows.map(rowToLeaveTypeApi);
}

export async function createLeaveType(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  userId: string | null
): Promise<LeaveTypeApi> {
  const fields: LeaveTypeWriteFields = {
    name: String(body.name ?? '').trim(),
    annual_quota: Number(body.annual_quota ?? body.annualQuota ?? 0) || 0,
    paid_leave: body.paid_leave ?? body.paidLeave ?? true,
    carry_forward: body.carry_forward ?? body.carryForward ?? false,
    active: body.active ?? true,
  } as LeaveTypeWriteFields;
  if (!fields.name) throw new LeaveValidationError('name is required.');
  const id = `lvt_${randomUUID().replace(/-/g, '')}`;
  const repo = new LeaveRepository(tenantId);
  const row = await repo.insertType(client, id, fields);
  const api = rowToLeaveTypeApi(row);
  await auditLeave(client, tenantId, 'leave_type', id, 'create', 'leave_type.created', userId, null, api);
  return api;
}

export async function updateLeaveType(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>,
  userId: string | null
): Promise<LeaveTypeApi | null> {
  const repo = new LeaveRepository(tenantId);
  const prior = await repo.getTypeById(client, id);
  if (!prior) return null;
  const fields: Partial<LeaveTypeWriteFields> = {};
  if (body.name !== undefined) fields.name = String(body.name).trim();
  if (body.annual_quota !== undefined || body.annualQuota !== undefined) {
    fields.annual_quota = Number(body.annual_quota ?? body.annualQuota ?? 0) || 0;
  }
  if (body.paid_leave !== undefined || body.paidLeave !== undefined) {
    fields.paid_leave = Boolean(body.paid_leave ?? body.paidLeave);
  }
  if (body.carry_forward !== undefined || body.carryForward !== undefined) {
    fields.carry_forward = Boolean(body.carry_forward ?? body.carryForward);
  }
  if (body.active !== undefined) fields.active = Boolean(body.active);
  const row = await repo.updateType(client, id, fields);
  if (!row) return null;
  const api = rowToLeaveTypeApi(row);
  await auditLeave(client, tenantId, 'leave_type', id, 'update', 'leave_type.updated', userId, rowToLeaveTypeApi(prior), api);
  return api;
}

export async function deleteLeaveType(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  userId: string | null
): Promise<boolean> {
  const repo = new LeaveRepository(tenantId);
  const prior = await repo.getTypeById(client, id);
  if (!prior) return false;
  const ok = await repo.markTypeDeleted(client, id);
  if (ok) {
    await auditLeave(client, tenantId, 'leave_type', id, 'delete', 'leave_type.deleted', userId, rowToLeaveTypeApi(prior));
  }
  return ok;
}

async function auditAttendanceFromLeave(
  client: pg.PoolClient,
  tenantId: string,
  action: 'create' | 'update' | 'delete',
  auditAction: 'attendance.created_from_leave' | 'attendance.deleted_from_leave',
  userId: string | null | undefined,
  prior: AttendanceRecordRow | null | undefined,
  row: AttendanceRecordRow | null | undefined
): Promise<void> {
  const entityId = row?.id ?? prior?.id;
  if (!entityId) return;
  await recordDomainMutation(client, {
    tenantId,
    userId: userId ?? null,
    module: 'attendance',
    entityType: 'attendance_record',
    entityId,
    action,
    auditAction,
    summary: `Attendance ${entityId} ${auditAction}`,
    newValue: row && action !== 'delete' ? rowToAttendanceApi(row) : undefined,
    oldValue: prior ? rowToAttendanceApi(prior) : row && action === 'delete' ? rowToAttendanceApi(row) : undefined,
  });
}

async function validateBalanceForRequest(
  client: pg.PoolClient,
  tenantId: string,
  employeeId: string,
  leaveType: LeaveTypeRow,
  days: number,
  fromDate: string
): Promise<void> {
  if (!leaveType.paid_leave) return;
  const year = Number(fromDate.slice(0, 4));
  const repo = new LeaveRepository(tenantId);
  await repo.batchEnsureBalances(client, year, { employeeId });
  const balance = await repo.getBalance(client, employeeId, leaveType.id, year);
  if (!balance) throw new LeaveValidationError('Leave balance not found.');
  if (num(balance.balance_days) < days) {
    throw new LeaveValidationError(
      `Insufficient leave balance. Available: ${num(balance.balance_days)}, requested: ${days}.`
    );
  }
}

async function validateBalanceLocked(
  client: pg.PoolClient,
  tenantId: string,
  employeeId: string,
  leaveType: LeaveTypeRow,
  year: number,
  requiredDays: number
): Promise<void> {
  if (!leaveType.paid_leave) return;
  const repo = new LeaveRepository(tenantId);
  await repo.ensureBalanceRow(client, employeeId, leaveType.id, year, leaveType.annual_quota);
  const locked = await repo.lockBalanceForUpdate(client, employeeId, leaveType.id, year);
  if (!locked) throw new LeaveValidationError('Leave balance not found.');
  const available = num(locked.balance_days);
  if (available < requiredDays) {
    throw new LeaveValidationError(
      `Insufficient leave balance. Available: ${available}, requested: ${requiredDays}.`
    );
  }
}

async function applyBalanceDeltaLocked(
  client: pg.PoolClient,
  tenantId: string,
  employeeId: string,
  leaveType: LeaveTypeRow,
  year: number,
  deltaUsed: number
): Promise<void> {
  if (!leaveType.paid_leave) return;
  const repo = new LeaveRepository(tenantId);
  await repo.ensureBalanceRow(client, employeeId, leaveType.id, year, leaveType.annual_quota);
  const locked = await repo.lockBalanceForUpdate(client, employeeId, leaveType.id, year);
  if (!locked) throw new LeaveValidationError('Leave balance not found.');
  if (deltaUsed > 0 && num(locked.balance_days) < deltaUsed) {
    throw new LeaveValidationError(
      `Insufficient leave balance. Available: ${num(locked.balance_days)}, requested: ${deltaUsed}.`
    );
  }
  const updated = await repo.updateBalanceUsed(client, employeeId, leaveType.id, year, deltaUsed);
  if (!updated) throw new LeaveValidationError('Failed to update leave balance.');
}

function parseRequestBody(body: Record<string, unknown>): {
  employee_id: string;
  leave_type_id: string;
  from_date: string;
  to_date: string;
  reason: string | null;
  attachment_url: string | null;
  days: number;
} {
  const employee_id = String(body.employee_id ?? body.employeeId ?? '').trim();
  const leave_type_id = String(body.leave_type_id ?? body.leaveTypeId ?? '').trim();
  const from_date = String(body.from_date ?? body.fromDate ?? '').slice(0, 10);
  const to_date = String(body.to_date ?? body.toDate ?? '').slice(0, 10);
  if (!employee_id) throw new LeaveValidationError('employee_id is required.');
  if (!leave_type_id) throw new LeaveValidationError('leave_type_id is required.');
  if (!from_date || !to_date) throw new LeaveValidationError('from_date and to_date are required.');
  if (to_date < from_date) throw new LeaveValidationError('End date cannot be before start date.');
  const days = calculateLeaveDays(from_date, to_date);
  return {
    employee_id,
    leave_type_id,
    from_date,
    to_date,
    reason: body.reason != null ? String(body.reason) : null,
    attachment_url: body.attachment_url != null || body.attachmentUrl != null
      ? String(body.attachment_url ?? body.attachmentUrl ?? '')
      : null,
    days,
  };
}

export async function listLeaveRequests(
  client: pg.PoolClient,
  tenantId: string,
  filters: LeaveRequestListFilters,
  scopeCtx?: DataScopeEnforcementContext
): Promise<{ items: LeaveRequestApi[]; total: number; page: number; limit: number }> {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 50;
  const { rows, total } = await new LeaveRepository(tenantId).listRequests(
    client,
    { ...filters, page, limit },
    scopeCtx
  );
  return { items: rows.map(rowToLeaveRequestApi), total, page, limit };
}

export async function getLeaveRequest(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  scopeCtx?: DataScopeEnforcementContext
): Promise<LeaveRequestApi | null> {
  const row = await new LeaveRepository(tenantId).getRequestById(client, id, scopeCtx);
  return row ? rowToLeaveRequestApi(row) : null;
}

export async function createLeaveRequest(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  userId: string | null,
  scopeCtx?: DataScopeEnforcementContext
): Promise<LeaveRequestApi> {
  const parsed = parseRequestBody(body);
  await assertEmployeeDepartmentScope(client, tenantId, parsed.employee_id, scopeCtx);
  const repo = new LeaveRepository(tenantId);
  const leaveType = await repo.getTypeById(client, parsed.leave_type_id);
  if (!leaveType || !leaveType.active) throw new LeaveValidationError('Leave type not found.');
  if (await repo.hasOverlappingRequest(client, parsed.employee_id, parsed.from_date, parsed.to_date)) {
    throw new LeaveConflictError('Overlapping leave request exists for this employee.');
  }
  await validateBalanceForRequest(client, tenantId, parsed.employee_id, leaveType, parsed.days, parsed.from_date);
  const id = `lvr_${randomUUID().replace(/-/g, '')}`;
  const row = await repo.insertRequest(
    client,
    id,
    { ...parsed, status: 'PENDING' },
    userId
  );
  const withJoin = await repo.getRequestById(client, id);
  const api = rowToLeaveRequestApi(withJoin ?? row);
  await auditLeave(client, tenantId, 'leave_request', id, 'create', 'leave.created', userId, null, api);
  return api;
}

export async function updateLeaveRequest(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>,
  userId: string | null,
  scopeCtx?: DataScopeEnforcementContext
): Promise<LeaveRequestApi | null> {
  const repo = new LeaveRepository(tenantId);
  const prior = await repo.getRequestById(client, id, scopeCtx);
  if (!prior) return null;
  if (prior.status !== 'PENDING') {
    throw new LeaveValidationError('Only pending leave requests can be edited.');
  }
  const employee_id = String(body.employee_id ?? body.employeeId ?? prior.employee_id).trim();
  const leave_type_id = String(body.leave_type_id ?? body.leaveTypeId ?? prior.leave_type_id).trim();
  const from_date = String(body.from_date ?? body.fromDate ?? dateStr(prior.from_date)).slice(0, 10);
  const to_date = String(body.to_date ?? body.toDate ?? dateStr(prior.to_date)).slice(0, 10);
  const reason = body.reason !== undefined ? (body.reason != null ? String(body.reason) : null) : prior.reason;
  const attachment_url =
    body.attachment_url !== undefined || body.attachmentUrl !== undefined
      ? body.attachment_url != null || body.attachmentUrl != null
        ? String(body.attachment_url ?? body.attachmentUrl ?? '')
        : null
      : prior.attachment_url;
  if (to_date < from_date) throw new LeaveValidationError('End date cannot be before start date.');
  const days = calculateLeaveDays(from_date, to_date);
  await assertEmployeeDepartmentScope(client, tenantId, employee_id, scopeCtx);
  const leaveType = await repo.getTypeById(client, leave_type_id);
  if (!leaveType) throw new LeaveValidationError('Leave type not found.');
  if (await repo.hasOverlappingRequest(client, employee_id, from_date, to_date, id)) {
    throw new LeaveConflictError('Overlapping leave request exists for this employee.');
  }
  await validateBalanceForRequest(client, tenantId, employee_id, leaveType, days, from_date);
  const row = await repo.updateRequest(
    client,
    id,
    { employee_id, leave_type_id, from_date, to_date, days, reason, attachment_url },
    userId
  );
  if (!row) return null;
  const withJoin = await repo.getRequestById(client, id, scopeCtx);
  const api = rowToLeaveRequestApi(withJoin ?? row);
  await auditLeave(client, tenantId, 'leave_request', id, 'update', 'leave.updated', userId, rowToLeaveRequestApi(prior), api);
  return api;
}

export async function deleteLeaveRequest(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  userId: string | null,
  scopeCtx?: DataScopeEnforcementContext
): Promise<boolean> {
  const repo = new LeaveRepository(tenantId);
  const prior = await repo.getRequestById(client, id, scopeCtx);
  if (!prior) return false;
  if (prior.status !== 'PENDING') {
    throw new LeaveValidationError('Only pending leave requests can be deleted.');
  }
  const ok = await repo.markRequestDeleted(client, id, userId);
  if (ok) {
    await auditLeave(client, tenantId, 'leave_request', id, 'delete', 'leave.deleted', userId, rowToLeaveRequestApi(prior));
  }
  return ok;
}

async function assertNoAttendanceConflictsForLeave(
  client: pg.PoolClient,
  tenantId: string,
  request: LeaveRequestApi,
  forceOverride: boolean
): Promise<void> {
  if (forceOverride) return;
  const conflicts = await new AttendanceRepository(tenantId).findNonLeaveActiveInDateRange(
    client,
    request.employee_id,
    request.from_date,
    request.to_date
  );
  if (conflicts.length > 0) {
    throw new LeaveAttendanceConflictError();
  }
}

async function createAttendanceForLeave(
  client: pg.PoolClient,
  tenantId: string,
  request: LeaveRequestApi,
  userId: string | null,
  isPaidLeave: boolean,
  forceOverride = false,
  skipConflictCheck = false
): Promise<string[]> {
  const attendanceRepo = new AttendanceRepository(tenantId);
  const dates = enumerateLeaveDates(request.from_date, request.to_date);

  if (!skipConflictCheck && !forceOverride) {
    await assertNoAttendanceConflictsForLeave(client, tenantId, request, false);
  }

  const attendanceIds: string[] = [];
  for (const date of dates) {
    if (forceOverride) {
      const prior = await attendanceRepo.findActiveByEmployeeDate(client, request.employee_id, date);
      const updated = await attendanceRepo.updateRecordToLeaveByLeaveRequest(
        client,
        request.id,
        request.employee_id,
        date,
        userId,
        isPaidLeave
      );
      if (updated) {
        attendanceIds.push(updated.id);
        await auditAttendanceFromLeave(
          client,
          tenantId,
          prior && prior.id !== updated.id ? 'create' : 'update',
          'attendance.created_from_leave',
          userId,
          prior,
          updated
        );
        continue;
      }
    } else {
      const existing = await attendanceRepo.findActiveByEmployeeDate(client, request.employee_id, date);
      if (existing) {
        const updated = await attendanceRepo.updateRecordToLeaveByLeaveRequest(
          client,
          request.id,
          request.employee_id,
          date,
          userId,
          isPaidLeave
        );
        if (updated) {
          attendanceIds.push(updated.id);
          await auditAttendanceFromLeave(
            client,
            tenantId,
            'update',
            'attendance.created_from_leave',
            userId,
            existing,
            updated
          );
        }
        continue;
      }
    }

    const attId = `att_${randomUUID().replace(/-/g, '')}`;
    try {
      const row = await attendanceRepo.insertRecord(
        client,
        attId,
        {
          employee_id: request.employee_id,
          attendance_date: date,
          status: 'LEAVE',
          check_in: null,
          check_out: null,
          late_minutes: 0,
          remarks: request.reason ? `Leave: ${request.reason}` : 'Approved leave',
        },
        userId,
        request.id,
        isPaidLeave
      );
      attendanceIds.push(row.id);
      await auditAttendanceFromLeave(
        client,
        tenantId,
        'create',
        'attendance.created_from_leave',
        userId,
        null,
        row
      );
    } catch (e) {
      const dup = toAttendanceDuplicateError(e);
      if (dup && forceOverride) {
        const prior = await attendanceRepo.findActiveByEmployeeDate(client, request.employee_id, date);
        const again = await attendanceRepo.updateRecordToLeaveByLeaveRequest(
          client,
          request.id,
          request.employee_id,
          date,
          userId,
          isPaidLeave
        );
        if (again) {
          attendanceIds.push(again.id);
          await auditAttendanceFromLeave(
            client,
            tenantId,
            'update',
            'attendance.created_from_leave',
            userId,
            prior,
            again
          );
        }
        continue;
      }
      if (dup) throw new LeaveAttendanceConflictError();
      throw e;
    }
  }
  return attendanceIds;
}

export async function approveLeaveRequest(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  userId: string | null,
  scopeCtx?: DataScopeEnforcementContext,
  options?: { forceOverride?: boolean }
): Promise<{ request: LeaveRequestApi; attendanceIds: string[] }> {
  const forceOverride = options?.forceOverride ?? false;
  const repo = new LeaveRepository(tenantId);
  const prior = await repo.getRequestById(client, id, scopeCtx);
  if (!prior) throw new LeaveValidationError('Leave request not found.');
  if (prior.status !== 'PENDING') {
    throw new LeaveValidationError('Only pending leave requests can be approved.');
  }
  const leaveType = await repo.getTypeById(client, prior.leave_type_id);
  if (!leaveType) throw new LeaveValidationError('Leave type not found.');
  const days = num(prior.days);
  const fromDate = dateStr(prior.from_date);
  const year = Number(fromDate.slice(0, 4));
  const apiPrior = rowToLeaveRequestApi(prior);

  if (leaveType.paid_leave) {
    await validateBalanceLocked(client, tenantId, prior.employee_id, leaveType, year, days);
  }
  await assertNoAttendanceConflictsForLeave(client, tenantId, apiPrior, forceOverride);

  const row = await repo.updateRequest(
    client,
    id,
    {
      status: 'APPROVED',
      approved_by: userId,
      approved_at: new Date(),
      rejection_reason: null,
    },
    userId
  );
  if (!row) throw new LeaveValidationError('Failed to approve leave request.');

  if (leaveType.paid_leave) {
    await applyBalanceDeltaLocked(client, tenantId, prior.employee_id, leaveType, year, days);
  }

  const withJoin = await repo.getRequestById(client, id, scopeCtx);
  const api = rowToLeaveRequestApi(withJoin ?? row);
  const attendanceIds = await createAttendanceForLeave(
    client,
    tenantId,
    api,
    userId,
    leaveType.paid_leave,
    forceOverride,
    true
  );
  await auditLeave(client, tenantId, 'leave_request', id, 'update', 'leave.approved', userId, rowToLeaveRequestApi(prior), api);
  return { request: api, attendanceIds };
}

export async function rejectLeaveRequest(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  reason: string | null,
  userId: string | null,
  scopeCtx?: DataScopeEnforcementContext
): Promise<LeaveRequestApi | null> {
  const trimmed = reason?.trim() ?? '';
  if (!trimmed) {
    throw new LeaveValidationError('Rejection reason is required.');
  }
  const repo = new LeaveRepository(tenantId);
  const prior = await repo.getRequestById(client, id, scopeCtx);
  if (!prior) return null;
  if (prior.status !== 'PENDING') {
    throw new LeaveValidationError('Only pending leave requests can be rejected.');
  }
  const row = await repo.updateRequest(
    client,
    id,
    {
      status: 'REJECTED',
      approved_by: userId,
      approved_at: new Date(),
      rejection_reason: trimmed,
    },
    userId
  );
  if (!row) return null;
  const withJoin = await repo.getRequestById(client, id, scopeCtx);
  const api = rowToLeaveRequestApi(withJoin ?? row);
  await auditLeave(client, tenantId, 'leave_request', id, 'update', 'leave.rejected', userId, rowToLeaveRequestApi(prior), api);
  return api;
}

export async function cancelLeaveRequest(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  userId: string | null,
  scopeCtx?: DataScopeEnforcementContext
): Promise<{ request: LeaveRequestApi; attendanceIds: string[] }> {
  const repo = new LeaveRepository(tenantId);
  const prior = await repo.getRequestById(client, id, scopeCtx);
  if (!prior) throw new LeaveValidationError('Leave request not found.');
  if (prior.status === 'REJECTED' || prior.status === 'CANCELLED') {
    throw new LeaveValidationError('This leave request cannot be cancelled.');
  }
  if (prior.status === 'APPROVED') {
    const leaveType = await repo.getTypeById(client, prior.leave_type_id);
    if (leaveType?.paid_leave) {
      const year = Number(dateStr(prior.from_date).slice(0, 4));
      await applyBalanceDeltaLocked(client, tenantId, prior.employee_id, leaveType, year, -num(prior.days));
    }
  }
  const row = await repo.updateRequest(client, id, { status: 'CANCELLED' }, userId);
  if (!row) throw new LeaveValidationError('Failed to cancel leave request.');
  let attendanceIds: string[] = [];
  if (prior.status === 'APPROVED') {
    const deletedRows = await new AttendanceRepository(tenantId).markDeletedByLeaveRequest(client, id, userId);
    for (const deleted of deletedRows) {
      attendanceIds.push(deleted.id);
      await auditAttendanceFromLeave(
        client,
        tenantId,
        'delete',
        'attendance.deleted_from_leave',
        userId,
        deleted,
        deleted
      );
    }
  }
  const withJoin = await repo.getRequestById(client, id, scopeCtx);
  const api = rowToLeaveRequestApi(withJoin ?? row);
  await auditLeave(client, tenantId, 'leave_request', id, 'update', 'leave.cancelled', userId, rowToLeaveRequestApi(prior), api);
  return { request: api, attendanceIds };
}

export async function getLeaveDashboardCounts(
  client: pg.PoolClient,
  tenantId: string,
  today: string,
  scopeCtx?: DataScopeEnforcementContext
): Promise<LeaveDashboardCounts> {
  const repo = new LeaveRepository(tenantId);
  const counts = await repo.countByStatus(client, scopeCtx);
  return {
    pending: counts.PENDING ?? 0,
    approved: counts.APPROVED ?? 0,
    rejected: counts.REJECTED ?? 0,
    on_leave_today: await repo.countOnLeaveToday(client, today, scopeCtx),
  };
}

export async function listLeaveBalances(
  client: pg.PoolClient,
  tenantId: string,
  filters: LeaveBalanceListFilters,
  scopeCtx?: DataScopeEnforcementContext
): Promise<{ items: LeaveBalanceApi[]; total: number; page: number; limit: number }> {
  await ensureDefaultLeaveTypes(client, tenantId);
  const repo = new LeaveRepository(tenantId);
  const year = filters.year ?? new Date().getFullYear();
  await repo.batchEnsureBalances(
    client,
    year,
    { employeeId: filters.employeeId, departmentId: filters.departmentId },
    scopeCtx
  );
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 100;
  const { rows, total } = await repo.listBalances(client, { ...filters, year, page, limit }, scopeCtx);
  return { items: rows.map(rowToLeaveBalanceApi), total, page, limit };
}

export async function getEmployeeLeaveBalances(
  client: pg.PoolClient,
  tenantId: string,
  employeeId: string,
  year: number,
  scopeCtx?: DataScopeEnforcementContext
): Promise<LeaveBalanceApi[]> {
  await ensureDefaultLeaveTypes(client, tenantId);
  if (scopeCtx?.enabled) {
    await assertEmployeeDepartmentScope(client, tenantId, employeeId, scopeCtx);
  }
  const repo = new LeaveRepository(tenantId);
  await repo.batchEnsureBalances(client, year, { employeeId }, scopeCtx);
  const { rows } = await repo.listBalances(
    client,
    { employeeId, year, page: 1, limit: 50 },
    scopeCtx
  );
  return rows.map(rowToLeaveBalanceApi);
}

export async function listLeaveRequestsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<LeaveRequestApi[]> {
  const rows = await new LeaveRepository(tenantId).listRequestsChangedSince(client, since);
  return rows.map(rowToLeaveRequestApi);
}
