import type pg from 'pg';
import { TenantRepository } from '../../core/TenantRepository.js';
import type { DataScopeEnforcementContext } from '../../auth/tenantRepositoryScope.js';
import {
  appendScopeFragment,
  applyDepartmentScope,
  rowMatchesScope,
} from '../../auth/tenantRepositoryScope.js';
import type {
  AttendanceListFilters,
  AttendanceRecordRow,
  AttendanceStatus,
  AttendanceSummaryApi,
} from './attendance.types.js';

const RECORD_COLUMNS = `ar.id, ar.tenant_id, ar.employee_id, ar.attendance_date, ar.status,
  ar.check_in, ar.check_out, ar.late_minutes, ar.remarks,
  ar.created_by, ar.updated_by, ar.created_at, ar.updated_at, ar.deleted_at`;

const RECORD_WITH_EMP_COLUMNS = `${RECORD_COLUMNS},
  e.name AS employee_name, e.employee_code, e.department, e.department_id`;

export type AttendanceWriteFields = {
  employee_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  check_in: Date | null;
  check_out: Date | null;
  late_minutes: number;
  remarks: string | null;
};

export type AttendanceRecordWithEmployee = AttendanceRecordRow & {
  employee_name?: string;
  employee_code?: string | null;
  department?: string;
  department_id?: string | null;
};

export class AttendanceRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(
    client: pg.PoolClient,
    id: string,
    scopeCtx?: DataScopeEnforcementContext
  ): Promise<AttendanceRecordWithEmployee | null> {
    const r = await client.query<AttendanceRecordWithEmployee>(
      `SELECT ${RECORD_WITH_EMP_COLUMNS}
       FROM attendance_records ar
       INNER JOIN payroll_employees e ON e.id = ar.employee_id AND e.tenant_id = ar.tenant_id
       WHERE ar.id = $1 AND ar.tenant_id = $2 AND ar.deleted_at IS NULL`,
      [id, this.tenantId]
    );
    const row = r.rows[0] ?? null;
    if (!row || !scopeCtx?.enabled) return row;
    return rowMatchesScope(scopeCtx, 'department', row.department_id ?? null) ? row : null;
  }

  async findNonLeaveActiveInDateRange(
    client: pg.PoolClient,
    employeeId: string,
    fromDate: string,
    toDate: string
  ): Promise<AttendanceRecordRow[]> {
    const r = await client.query<AttendanceRecordRow>(
      `SELECT ar.id, ar.tenant_id, ar.employee_id, ar.attendance_date, ar.status,
         ar.check_in, ar.check_out, ar.late_minutes, ar.remarks,
         ar.created_by, ar.updated_by, ar.created_at, ar.updated_at, ar.deleted_at
       FROM attendance_records ar
       WHERE ar.tenant_id = $1 AND ar.employee_id = $2 AND ar.deleted_at IS NULL
         AND ar.attendance_date >= $3::date AND ar.attendance_date <= $4::date
         AND ar.status <> 'LEAVE'`,
      [this.tenantId, employeeId, fromDate, toDate]
    );
    return r.rows;
  }

  async findActiveByEmployeeDate(
    client: pg.PoolClient,
    employeeId: string,
    attendanceDate: string,
    excludeId?: string
  ): Promise<AttendanceRecordRow | null> {
    const params: unknown[] = [this.tenantId, employeeId, attendanceDate];
    let excludeSql = '';
    if (excludeId) {
      params.push(excludeId);
      excludeSql = ` AND id <> $${params.length}`;
    }
    const r = await client.query<AttendanceRecordRow>(
      `SELECT ar.id, ar.tenant_id, ar.employee_id, ar.attendance_date, ar.status,
         ar.check_in, ar.check_out, ar.late_minutes, ar.remarks,
         ar.created_by, ar.updated_by, ar.created_at, ar.updated_at, ar.deleted_at
       FROM attendance_records ar
       WHERE ar.tenant_id = $1 AND ar.employee_id = $2 AND ar.attendance_date = $3::date
         AND ar.deleted_at IS NULL${excludeSql}`,
      params
    );
    return r.rows[0] ?? null;
  }

  async listFiltered(
    client: pg.PoolClient,
    filters: AttendanceListFilters,
    scopeCtx?: DataScopeEnforcementContext
  ): Promise<{ rows: AttendanceRecordWithEmployee[]; total: number }> {
    const conditions = ['ar.tenant_id = $1', 'ar.deleted_at IS NULL', 'e.deleted_at IS NULL'];
    const params: unknown[] = [this.tenantId];

    appendScopeFragment(
      conditions,
      params,
      applyDepartmentScope(scopeCtx ?? { enabled: false, scopes: [] }, 'e.department_id', params.length + 1)
    );

    if (filters.date) {
      params.push(filters.date);
      conditions.push(`ar.attendance_date = $${params.length}::date`);
    }
    if (filters.month && filters.year) {
      const { startOfMonth, endOfMonth } = monthDateRange(filters.year, filters.month);
      params.push(startOfMonth, endOfMonth);
      conditions.push(
        `ar.attendance_date >= $${params.length - 1}::date`,
        `ar.attendance_date <= $${params.length}::date`
      );
    } else if (filters.year) {
      params.push(`${filters.year}-01-01`, `${filters.year}-12-31`);
      conditions.push(
        `ar.attendance_date >= $${params.length - 1}::date`,
        `ar.attendance_date <= $${params.length}::date`
      );
    }
    if (filters.employeeId) {
      params.push(filters.employeeId);
      conditions.push(`ar.employee_id = $${params.length}`);
    }
    if (filters.departmentId) {
      params.push(filters.departmentId);
      conditions.push(`e.department_id = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`ar.status = $${params.length}`);
    }

    const where = conditions.join(' AND ');
    const countR = await client.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt
       FROM attendance_records ar
       INNER JOIN payroll_employees e ON e.id = ar.employee_id AND e.tenant_id = ar.tenant_id
       WHERE ${where}`,
      params
    );
    const total = Number(countR.rows[0]?.cnt ?? 0);

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const offset = (page - 1) * limit;

    params.push(limit, offset);
    const r = await client.query<AttendanceRecordWithEmployee>(
      `SELECT ${RECORD_WITH_EMP_COLUMNS}
       FROM attendance_records ar
       INNER JOIN payroll_employees e ON e.id = ar.employee_id AND e.tenant_id = ar.tenant_id
       WHERE ${where}
       ORDER BY ar.attendance_date DESC, e.name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { rows: r.rows, total };
  }

  async insertRecord(
    client: pg.PoolClient,
    id: string,
    fields: AttendanceWriteFields,
    userId: string | null,
    leaveRequestId?: string | null,
    isPaidLeave?: boolean | null
  ): Promise<AttendanceRecordRow> {
    const r = await client.query<AttendanceRecordRow>(
      `INSERT INTO attendance_records (
         id, tenant_id, employee_id, attendance_date, status,
         check_in, check_out, late_minutes, remarks, leave_request_id, is_paid_leave,
         created_by, updated_by, created_at, updated_at
       ) VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11,$12,$12,NOW(),NOW())
       RETURNING id, tenant_id, employee_id, attendance_date, status,
         check_in, check_out, late_minutes, remarks,
         created_by, updated_by, created_at, updated_at, deleted_at`,
      [
        id,
        this.tenantId,
        fields.employee_id,
        fields.attendance_date,
        fields.status,
        fields.check_in,
        fields.check_out,
        fields.late_minutes,
        fields.remarks,
        leaveRequestId ?? null,
        isPaidLeave ?? null,
        userId,
      ]
    );
    const row = r.rows[0];
    if (!row) throw new Error('Failed to create attendance record.');
    return row;
  }

  async updateRecord(
    client: pg.PoolClient,
    id: string,
    fields: Partial<AttendanceWriteFields>,
    userId: string | null
  ): Promise<AttendanceRecordRow | null> {
    const sets: string[] = ['updated_by = $3', 'updated_at = NOW()'];
    const params: unknown[] = [id, this.tenantId, userId];
    const add = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (fields.status !== undefined) add('status', fields.status);
    if (fields.check_in !== undefined) add('check_in', fields.check_in);
    if (fields.check_out !== undefined) add('check_out', fields.check_out);
    if (fields.late_minutes !== undefined) add('late_minutes', fields.late_minutes);
    if (fields.remarks !== undefined) add('remarks', fields.remarks);
    if (fields.attendance_date !== undefined) add('attendance_date', fields.attendance_date);
    if (fields.employee_id !== undefined) add('employee_id', fields.employee_id);

    const r = await client.query<AttendanceRecordRow>(
      `UPDATE attendance_records SET ${sets.join(', ')}
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id, tenant_id, employee_id, attendance_date, status,
         check_in, check_out, late_minutes, remarks,
         created_by, updated_by, created_at, updated_at, deleted_at`,
      params
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(client: pg.PoolClient, id: string, userId: string | null): Promise<boolean> {
    const r = await client.query(
      `UPDATE attendance_records SET deleted_at = NOW(), updated_by = $3, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId, userId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async markDeletedByLeaveRequest(
    client: pg.PoolClient,
    leaveRequestId: string,
    userId: string | null
  ): Promise<AttendanceRecordRow[]> {
    const r = await client.query<AttendanceRecordRow>(
      `UPDATE attendance_records SET deleted_at = NOW(), updated_by = $3, updated_at = NOW()
       WHERE tenant_id = $1 AND leave_request_id = $2 AND deleted_at IS NULL
       RETURNING id, tenant_id, employee_id, attendance_date, status,
         check_in, check_out, late_minutes, remarks,
         created_by, updated_by, created_at, updated_at, deleted_at`,
      [this.tenantId, leaveRequestId, userId]
    );
    return r.rows;
  }

  async updateRecordToLeaveByLeaveRequest(
    client: pg.PoolClient,
    leaveRequestId: string,
    employeeId: string,
    attendanceDate: string,
    userId: string | null,
    isPaidLeave?: boolean | null
  ): Promise<AttendanceRecordRow | null> {
    const existing = await this.findActiveByEmployeeDate(client, employeeId, attendanceDate);
    if (existing) {
      const r = await client.query<AttendanceRecordRow>(
        `UPDATE attendance_records SET status = 'LEAVE', leave_request_id = $3, is_paid_leave = $4, updated_by = $5, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
         RETURNING id, tenant_id, employee_id, attendance_date, status,
           check_in, check_out, late_minutes, remarks,
           created_by, updated_by, created_at, updated_at, deleted_at`,
        [existing.id, this.tenantId, leaveRequestId, isPaidLeave ?? null, userId]
      );
      return r.rows[0] ?? null;
    }
    return null;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<AttendanceRecordRow[]> {
    const r = await client.query<AttendanceRecordRow>(
      `SELECT id, tenant_id, employee_id, attendance_date, status,
         check_in, check_out, late_minutes, remarks,
         created_by, updated_by, created_at, updated_at, deleted_at
       FROM attendance_records
       WHERE tenant_id = $1 AND updated_at > $2
       ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }

  async countByStatusForDate(
    client: pg.PoolClient,
    date: string,
    scopeCtx?: DataScopeEnforcementContext
  ): Promise<Record<string, number>> {
    const conditions = ['ar.tenant_id = $1', 'ar.deleted_at IS NULL', 'ar.attendance_date = $2::date', 'e.deleted_at IS NULL'];
    const params: unknown[] = [this.tenantId, date];
    appendScopeFragment(
      conditions,
      params,
      applyDepartmentScope(scopeCtx ?? { enabled: false, scopes: [] }, 'e.department_id', params.length + 1)
    );
    const r = await client.query<{ status: string; cnt: string }>(
      `SELECT ar.status, COUNT(*)::text AS cnt
       FROM attendance_records ar
       INNER JOIN payroll_employees e ON e.id = ar.employee_id AND e.tenant_id = ar.tenant_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY ar.status`,
      params
    );
    const out: Record<string, number> = {};
    for (const row of r.rows) out[row.status] = Number(row.cnt);
    return out;
  }

  async listForMonthSheet(
    client: pg.PoolClient,
    year: number,
    month: number,
    departmentId: string | undefined,
    scopeCtx?: DataScopeEnforcementContext
  ): Promise<AttendanceRecordWithEmployee[]> {
    const { startOfMonth, endOfMonth } = monthDateRange(year, month);
    const conditions = [
      'ar.tenant_id = $1',
      'ar.deleted_at IS NULL',
      'e.deleted_at IS NULL',
      'ar.attendance_date >= $2::date',
      'ar.attendance_date <= $3::date',
    ];
    const params: unknown[] = [this.tenantId, startOfMonth, endOfMonth];
    appendScopeFragment(
      conditions,
      params,
      applyDepartmentScope(scopeCtx ?? { enabled: false, scopes: [] }, 'e.department_id', params.length + 1)
    );
    if (departmentId) {
      params.push(departmentId);
      conditions.push(`e.department_id = $${params.length}`);
    }
    const r = await client.query<AttendanceRecordWithEmployee>(
      `SELECT ${RECORD_WITH_EMP_COLUMNS}
       FROM attendance_records ar
       INNER JOIN payroll_employees e ON e.id = ar.employee_id AND e.tenant_id = ar.tenant_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY e.name ASC, ar.attendance_date ASC`,
      params
    );
    return r.rows;
  }

  async summarizeForEmployeeMonth(
    client: pg.PoolClient,
    employeeId: string,
    year: number,
    month: number
  ): Promise<AttendanceSummaryApi> {
    const { startOfMonth, endOfMonth } = monthDateRange(year, month);
    const r = await client.query<{ status: string; cnt: string }>(
      `SELECT status, COUNT(*)::text AS cnt
       FROM attendance_records
       WHERE tenant_id = $1 AND employee_id = $2 AND deleted_at IS NULL
         AND attendance_date >= $3::date
         AND attendance_date <= $4::date
       GROUP BY status`,
      [this.tenantId, employeeId, startOfMonth, endOfMonth]
    );
    return buildSummaryFromStatusCounts(r.rows, year, month);
  }
}

export function buildSummaryFromStatusCounts(
  rows: { status: string; cnt: string }[],
  year: number,
  month: number
): AttendanceSummaryApi {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.status] = Number(row.cnt);
  const daysInMonth = new Date(year, month, 0).getDate();
  const present = counts.PRESENT ?? 0;
  const absent = counts.ABSENT ?? 0;
  const leave = counts.LEAVE ?? 0;
  const late = counts.LATE ?? 0;
  const half = counts.HALF_DAY ?? 0;
  const marked = present + absent + leave + late + half;
  return {
    working_days: daysInMonth,
    present_days: present + late,
    absent_days: absent,
    leave_days: leave,
    late_days: late,
    half_days: half,
  };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Inclusive calendar month bounds as YYYY-MM-DD (month is 1–12). */
export function monthDateRange(year: number, month: number): { startOfMonth: string; endOfMonth: string } {
  const dim = daysInMonth(year, month);
  const mm = String(month).padStart(2, '0');
  return {
    startOfMonth: `${year}-${mm}-01`,
    endOfMonth: `${year}-${mm}-${String(dim).padStart(2, '0')}`,
  };
}
