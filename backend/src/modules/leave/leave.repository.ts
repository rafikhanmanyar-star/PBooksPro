import type pg from 'pg';
import { TenantRepository } from '../../core/TenantRepository.js';
import type { DataScopeEnforcementContext } from '../../auth/tenantRepositoryScope.js';
import {
  appendScopeFragment,
  applyDepartmentScope,
  rowMatchesScope,
} from '../../auth/tenantRepositoryScope.js';
import type {
  LeaveBalanceListFilters,
  LeaveBalanceRow,
  LeaveRequestListFilters,
  LeaveRequestRow,
  LeaveStatus,
  LeaveTypeRow,
} from './leave.types.js';

const LEAVE_TYPE_COLUMNS = `id, tenant_id, name, annual_quota, paid_leave, carry_forward, active, created_at, updated_at, deleted_at`;

const LEAVE_REQUEST_COLUMNS = `lr.id, lr.tenant_id, lr.employee_id, lr.leave_type_id, lr.from_date, lr.to_date, lr.days,
  lr.reason, lr.attachment_url, lr.status, lr.approved_by, lr.approved_at, lr.rejection_reason,
  lr.created_by, lr.updated_by, lr.created_at, lr.updated_at, lr.deleted_at`;

const LEAVE_REQUEST_WITH_JOIN = `${LEAVE_REQUEST_COLUMNS},
  e.name AS employee_name, e.employee_code, e.department, e.department_id,
  lt.name AS leave_type_name`;

const LEAVE_BALANCE_COLUMNS = `lb.id, lb.tenant_id, lb.employee_id, lb.leave_type_id, lb.year,
  lb.allocated_days, lb.used_days, lb.balance_days, lb.created_at, lb.updated_at, lb.deleted_at`;

const LEAVE_BALANCE_WITH_JOIN = `${LEAVE_BALANCE_COLUMNS},
  e.name AS employee_name, e.department, lt.name AS leave_type_name`;

export type LeaveRequestWithJoin = LeaveRequestRow & {
  employee_name?: string;
  employee_code?: string | null;
  department?: string;
  department_id?: string | null;
  leave_type_name?: string;
};

export type LeaveBalanceWithJoin = LeaveBalanceRow & {
  employee_name?: string;
  department?: string;
  leave_type_name?: string;
};

export type LeaveTypeWriteFields = {
  name: string;
  annual_quota: number;
  paid_leave: boolean;
  carry_forward: boolean;
  active: boolean;
};

export type LeaveRequestWriteFields = {
  employee_id: string;
  leave_type_id: string;
  from_date: string;
  to_date: string;
  days: number;
  reason: string | null;
  attachment_url: string | null;
  status: LeaveStatus;
};

export class LeaveRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async listTypes(client: pg.PoolClient, activeOnly = false): Promise<LeaveTypeRow[]> {
    const conditions = ['tenant_id = $1', 'deleted_at IS NULL'];
    const params: unknown[] = [this.tenantId];
    if (activeOnly) conditions.push('active = TRUE');
    const r = await client.query<LeaveTypeRow>(
      `SELECT ${LEAVE_TYPE_COLUMNS} FROM leave_types
       WHERE ${conditions.join(' AND ')} ORDER BY name ASC`,
      params
    );
    return r.rows;
  }

  async getTypeById(client: pg.PoolClient, id: string): Promise<LeaveTypeRow | null> {
    const r = await client.query<LeaveTypeRow>(
      `SELECT ${LEAVE_TYPE_COLUMNS} FROM leave_types
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async insertType(client: pg.PoolClient, id: string, fields: LeaveTypeWriteFields): Promise<LeaveTypeRow> {
    const r = await client.query<LeaveTypeRow>(
      `INSERT INTO leave_types (id, tenant_id, name, annual_quota, paid_leave, carry_forward, active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
       RETURNING ${LEAVE_TYPE_COLUMNS}`,
      [id, this.tenantId, fields.name, fields.annual_quota, fields.paid_leave, fields.carry_forward, fields.active]
    );
    const row = r.rows[0];
    if (!row) throw new Error('Failed to create leave type.');
    return row;
  }

  async updateType(
    client: pg.PoolClient,
    id: string,
    fields: Partial<LeaveTypeWriteFields>
  ): Promise<LeaveTypeRow | null> {
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [id, this.tenantId];
    const add = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (fields.name !== undefined) add('name', fields.name);
    if (fields.annual_quota !== undefined) add('annual_quota', fields.annual_quota);
    if (fields.paid_leave !== undefined) add('paid_leave', fields.paid_leave);
    if (fields.carry_forward !== undefined) add('carry_forward', fields.carry_forward);
    if (fields.active !== undefined) add('active', fields.active);
    const r = await client.query<LeaveTypeRow>(
      `UPDATE leave_types SET ${sets.join(', ')}
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${LEAVE_TYPE_COLUMNS}`,
      params
    );
    return r.rows[0] ?? null;
  }

  async markTypeDeleted(client: pg.PoolClient, id: string): Promise<boolean> {
    const r = await client.query(
      `UPDATE leave_types SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async getRequestById(
    client: pg.PoolClient,
    id: string,
    scopeCtx?: DataScopeEnforcementContext
  ): Promise<LeaveRequestWithJoin | null> {
    const r = await client.query<LeaveRequestWithJoin>(
      `SELECT ${LEAVE_REQUEST_WITH_JOIN}
       FROM leave_requests lr
       INNER JOIN payroll_employees e ON e.id = lr.employee_id AND e.tenant_id = lr.tenant_id
       INNER JOIN leave_types lt ON lt.id = lr.leave_type_id AND lt.tenant_id = lr.tenant_id
       WHERE lr.id = $1 AND lr.tenant_id = $2 AND lr.deleted_at IS NULL`,
      [id, this.tenantId]
    );
    const row = r.rows[0] ?? null;
    if (!row || !scopeCtx?.enabled) return row;
    return rowMatchesScope(scopeCtx, 'department', row.department_id ?? null) ? row : null;
  }

  async listRequests(
    client: pg.PoolClient,
    filters: LeaveRequestListFilters,
    scopeCtx?: DataScopeEnforcementContext
  ): Promise<{ rows: LeaveRequestWithJoin[]; total: number }> {
    const conditions = ['lr.tenant_id = $1', 'lr.deleted_at IS NULL', 'e.deleted_at IS NULL'];
    const params: unknown[] = [this.tenantId];
    appendScopeFragment(
      conditions,
      params,
      applyDepartmentScope(scopeCtx ?? { enabled: false, scopes: [] }, 'e.department_id', params.length + 1)
    );
    if (filters.employeeId) {
      params.push(filters.employeeId);
      conditions.push(`lr.employee_id = $${params.length}`);
    }
    if (filters.departmentId) {
      params.push(filters.departmentId);
      conditions.push(`e.department_id = $${params.length}`);
    }
    if (filters.leaveTypeId) {
      params.push(filters.leaveTypeId);
      conditions.push(`lr.leave_type_id = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`lr.status = $${params.length}`);
    }
    if (filters.fromDate) {
      params.push(filters.fromDate);
      conditions.push(`lr.to_date >= $${params.length}::date`);
    }
    if (filters.toDate) {
      params.push(filters.toDate);
      conditions.push(`lr.from_date <= $${params.length}::date`);
    }
    const where = conditions.join(' AND ');
    const countR = await client.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM leave_requests lr
       INNER JOIN payroll_employees e ON e.id = lr.employee_id AND e.tenant_id = lr.tenant_id
       WHERE ${where}`,
      params
    );
    const total = Number(countR.rows[0]?.cnt ?? 0);
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const r = await client.query<LeaveRequestWithJoin>(
      `SELECT ${LEAVE_REQUEST_WITH_JOIN}
       FROM leave_requests lr
       INNER JOIN payroll_employees e ON e.id = lr.employee_id AND e.tenant_id = lr.tenant_id
       INNER JOIN leave_types lt ON lt.id = lr.leave_type_id AND lt.tenant_id = lr.tenant_id
       WHERE ${where}
       ORDER BY lr.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { rows: r.rows, total };
  }

  async hasOverlappingRequest(
    client: pg.PoolClient,
    employeeId: string,
    fromDate: string,
    toDate: string,
    excludeId?: string
  ): Promise<boolean> {
    const params: unknown[] = [this.tenantId, employeeId, fromDate, toDate];
    let excludeSql = '';
    if (excludeId) {
      params.push(excludeId);
      excludeSql = ` AND lr.id <> $${params.length}`;
    }
    const r = await client.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM leave_requests lr
       WHERE lr.tenant_id = $1 AND lr.employee_id = $2 AND lr.deleted_at IS NULL
         AND lr.status NOT IN ('REJECTED', 'CANCELLED')
         AND lr.from_date <= $4::date AND lr.to_date >= $3::date${excludeSql}`,
      params
    );
    return Number(r.rows[0]?.cnt ?? 0) > 0;
  }

  async insertRequest(
    client: pg.PoolClient,
    id: string,
    fields: LeaveRequestWriteFields,
    userId: string | null
  ): Promise<LeaveRequestRow> {
    const r = await client.query<LeaveRequestRow>(
      `INSERT INTO leave_requests (
         id, tenant_id, employee_id, leave_type_id, from_date, to_date, days,
         reason, attachment_url, status, created_by, updated_by, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5::date,$6::date,$7,$8,$9,$10,$11,$11,NOW(),NOW())
       RETURNING id, tenant_id, employee_id, leave_type_id, from_date, to_date, days,
         reason, attachment_url, status, approved_by, approved_at, rejection_reason,
         created_by, updated_by, created_at, updated_at, deleted_at`,
      [
        id,
        this.tenantId,
        fields.employee_id,
        fields.leave_type_id,
        fields.from_date,
        fields.to_date,
        fields.days,
        fields.reason,
        fields.attachment_url,
        fields.status,
        userId,
      ]
    );
    const row = r.rows[0];
    if (!row) throw new Error('Failed to create leave request.');
    return row;
  }

  async updateRequest(
    client: pg.PoolClient,
    id: string,
    fields: Partial<LeaveRequestWriteFields & {
      status: LeaveStatus;
      approved_by: string | null;
      approved_at: Date | null;
      rejection_reason: string | null;
    }>,
    userId: string | null
  ): Promise<LeaveRequestRow | null> {
    const sets: string[] = ['updated_by = $3', 'updated_at = NOW()'];
    const params: unknown[] = [id, this.tenantId, userId];
    const add = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (fields.employee_id !== undefined) add('employee_id', fields.employee_id);
    if (fields.leave_type_id !== undefined) add('leave_type_id', fields.leave_type_id);
    if (fields.from_date !== undefined) add('from_date', fields.from_date);
    if (fields.to_date !== undefined) add('to_date', fields.to_date);
    if (fields.days !== undefined) add('days', fields.days);
    if (fields.reason !== undefined) add('reason', fields.reason);
    if (fields.attachment_url !== undefined) add('attachment_url', fields.attachment_url);
    if (fields.status !== undefined) add('status', fields.status);
    if (fields.approved_by !== undefined) add('approved_by', fields.approved_by);
    if (fields.approved_at !== undefined) add('approved_at', fields.approved_at);
    if (fields.rejection_reason !== undefined) add('rejection_reason', fields.rejection_reason);
    const r = await client.query<LeaveRequestRow>(
      `UPDATE leave_requests SET ${sets.join(', ')}
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id, tenant_id, employee_id, leave_type_id, from_date, to_date, days,
         reason, attachment_url, status, approved_by, approved_at, rejection_reason,
         created_by, updated_by, created_at, updated_at, deleted_at`,
      params
    );
    return r.rows[0] ?? null;
  }

  async markRequestDeleted(client: pg.PoolClient, id: string, userId: string | null): Promise<boolean> {
    const r = await client.query(
      `UPDATE leave_requests SET deleted_at = NOW(), updated_by = $3, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId, userId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async countByStatus(
    client: pg.PoolClient,
    scopeCtx?: DataScopeEnforcementContext
  ): Promise<Record<string, number>> {
    const conditions = ['lr.tenant_id = $1', 'lr.deleted_at IS NULL', 'e.deleted_at IS NULL'];
    const params: unknown[] = [this.tenantId];
    appendScopeFragment(
      conditions,
      params,
      applyDepartmentScope(scopeCtx ?? { enabled: false, scopes: [] }, 'e.department_id', params.length + 1)
    );
    const r = await client.query<{ status: string; cnt: string }>(
      `SELECT lr.status, COUNT(*)::text AS cnt FROM leave_requests lr
       INNER JOIN payroll_employees e ON e.id = lr.employee_id AND e.tenant_id = lr.tenant_id
       WHERE ${conditions.join(' AND ')} GROUP BY lr.status`,
      params
    );
    const out: Record<string, number> = {};
    for (const row of r.rows) out[row.status] = Number(row.cnt);
    return out;
  }

  async countOnLeaveToday(
    client: pg.PoolClient,
    date: string,
    scopeCtx?: DataScopeEnforcementContext
  ): Promise<number> {
    const conditions = [
      'lr.tenant_id = $1',
      'lr.deleted_at IS NULL',
      'e.deleted_at IS NULL',
      "lr.status = 'APPROVED'",
      'lr.from_date <= $2::date',
      'lr.to_date >= $2::date',
    ];
    const params: unknown[] = [this.tenantId, date];
    appendScopeFragment(
      conditions,
      params,
      applyDepartmentScope(scopeCtx ?? { enabled: false, scopes: [] }, 'e.department_id', params.length + 1)
    );
    const r = await client.query<{ cnt: string }>(
      `SELECT COUNT(DISTINCT lr.employee_id)::text AS cnt FROM leave_requests lr
       INNER JOIN payroll_employees e ON e.id = lr.employee_id AND e.tenant_id = lr.tenant_id
       WHERE ${conditions.join(' AND ')}`,
      params
    );
    return Number(r.rows[0]?.cnt ?? 0);
  }

  async getBalance(
    client: pg.PoolClient,
    employeeId: string,
    leaveTypeId: string,
    year: number
  ): Promise<LeaveBalanceRow | null> {
    const r = await client.query<LeaveBalanceRow>(
      `SELECT ${LEAVE_BALANCE_COLUMNS.replace(/lb\./g, '')} FROM leave_balances lb
       WHERE lb.tenant_id = $1 AND lb.employee_id = $2 AND lb.leave_type_id = $3
         AND lb.year = $4 AND lb.deleted_at IS NULL`,
      [this.tenantId, employeeId, leaveTypeId, year]
    );
    return r.rows[0] ?? null;
  }

  async lockBalanceForUpdate(
    client: pg.PoolClient,
    employeeId: string,
    leaveTypeId: string,
    year: number
  ): Promise<LeaveBalanceRow | null> {
    const r = await client.query<LeaveBalanceRow>(
      `SELECT id, tenant_id, employee_id, leave_type_id, year, allocated_days, used_days, balance_days, created_at, updated_at, deleted_at
       FROM leave_balances
       WHERE tenant_id = $1 AND employee_id = $2 AND leave_type_id = $3 AND year = $4 AND deleted_at IS NULL
       FOR UPDATE`,
      [this.tenantId, employeeId, leaveTypeId, year]
    );
    return r.rows[0] ?? null;
  }

  async ensureBalanceRow(
    client: pg.PoolClient,
    employeeId: string,
    leaveTypeId: string,
    year: number,
    allocated: number
  ): Promise<void> {
    await client.query(
      `INSERT INTO leave_balances (id, tenant_id, employee_id, leave_type_id, year, allocated_days, used_days, balance_days, created_at, updated_at)
       SELECT 'lvb_' || replace(gen_random_uuid()::text, '-', ''), $1, $2, $3, $4, $5, 0, $5, NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM leave_balances lb
         WHERE lb.tenant_id = $1 AND lb.employee_id = $2 AND lb.leave_type_id = $3
           AND lb.year = $4 AND lb.deleted_at IS NULL
       )`,
      [this.tenantId, employeeId, leaveTypeId, year, allocated]
    );
  }

  async batchEnsureBalances(
    client: pg.PoolClient,
    year: number,
    filters?: { employeeId?: string; departmentId?: string },
    scopeCtx?: DataScopeEnforcementContext
  ): Promise<number> {
    const conditions = [
      'e.tenant_id = $1',
      'e.deleted_at IS NULL',
      'lt.tenant_id = $1',
      'lt.deleted_at IS NULL',
      'lt.active = TRUE',
    ];
    const params: unknown[] = [this.tenantId, year];
    appendScopeFragment(
      conditions,
      params,
      applyDepartmentScope(scopeCtx ?? { enabled: false, scopes: [] }, 'e.department_id', params.length + 1)
    );
    if (filters?.employeeId) {
      params.push(filters.employeeId);
      conditions.push(`e.id = $${params.length}`);
    }
    if (filters?.departmentId) {
      params.push(filters.departmentId);
      conditions.push(`e.department_id = $${params.length}`);
    }
    const r = await client.query(
      `INSERT INTO leave_balances (id, tenant_id, employee_id, leave_type_id, year, allocated_days, used_days, balance_days, created_at, updated_at)
       SELECT
         'lvb_' || replace(gen_random_uuid()::text, '-', ''),
         e.tenant_id,
         e.id,
         lt.id,
         $2,
         lt.annual_quota,
         0,
         lt.annual_quota,
         NOW(),
         NOW()
       FROM payroll_employees e
       INNER JOIN leave_types lt ON lt.tenant_id = e.tenant_id AND lt.deleted_at IS NULL AND lt.active = TRUE
       WHERE ${conditions.join(' AND ')}
       AND NOT EXISTS (
         SELECT 1 FROM leave_balances lb
         WHERE lb.tenant_id = e.tenant_id AND lb.employee_id = e.id
           AND lb.leave_type_id = lt.id AND lb.year = $2 AND lb.deleted_at IS NULL
       )`,
      params
    );
    return r.rowCount ?? 0;
  }

  async insertBalance(
    client: pg.PoolClient,
    id: string,
    employeeId: string,
    leaveTypeId: string,
    year: number,
    allocated: number,
    used: number
  ): Promise<LeaveBalanceRow> {
    const balance = allocated - used;
    const r = await client.query<LeaveBalanceRow>(
      `INSERT INTO leave_balances (id, tenant_id, employee_id, leave_type_id, year, allocated_days, used_days, balance_days, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
       RETURNING id, tenant_id, employee_id, leave_type_id, year, allocated_days, used_days, balance_days, created_at, updated_at, deleted_at`,
      [id, this.tenantId, employeeId, leaveTypeId, year, allocated, used, balance]
    );
    const row = r.rows[0];
    if (!row) throw new Error('Failed to create leave balance.');
    return row;
  }

  async setBalance(
    client: pg.PoolClient,
    id: string,
    allocated: number,
    used: number
  ): Promise<LeaveBalanceRow | null> {
    const balance = allocated - used;
    const r = await client.query<LeaveBalanceRow>(
      `UPDATE leave_balances SET allocated_days = $3, used_days = $4, balance_days = $5, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id, tenant_id, employee_id, leave_type_id, year, allocated_days, used_days, balance_days, created_at, updated_at, deleted_at`,
      [id, this.tenantId, allocated, used, balance]
    );
    return r.rows[0] ?? null;
  }

  async upsertBalance(
    client: pg.PoolClient,
    id: string,
    employeeId: string,
    leaveTypeId: string,
    year: number,
    allocated: number,
    used: number
  ): Promise<LeaveBalanceRow> {
    const existing = await this.getBalance(client, employeeId, leaveTypeId, year);
    if (existing) {
      const updated = await this.setBalance(client, existing.id, allocated, used);
      if (updated) return updated;
    }
    return this.insertBalance(client, id, employeeId, leaveTypeId, year, allocated, used);
  }

  async updateBalanceUsed(
    client: pg.PoolClient,
    employeeId: string,
    leaveTypeId: string,
    year: number,
    deltaUsed: number
  ): Promise<LeaveBalanceRow | null> {
    const r = await client.query<LeaveBalanceRow>(
      `UPDATE leave_balances SET
         used_days = GREATEST(0, used_days + $5),
         balance_days = allocated_days - GREATEST(0, used_days + $5),
         updated_at = NOW()
       WHERE tenant_id = $1 AND employee_id = $2 AND leave_type_id = $3 AND year = $4 AND deleted_at IS NULL
       RETURNING id, tenant_id, employee_id, leave_type_id, year, allocated_days, used_days, balance_days, created_at, updated_at, deleted_at`,
      [this.tenantId, employeeId, leaveTypeId, year, deltaUsed]
    );
    return r.rows[0] ?? null;
  }

  async listBalances(
    client: pg.PoolClient,
    filters: LeaveBalanceListFilters,
    scopeCtx?: DataScopeEnforcementContext
  ): Promise<{ rows: LeaveBalanceWithJoin[]; total: number }> {
    const conditions = ['lb.tenant_id = $1', 'lb.deleted_at IS NULL', 'e.deleted_at IS NULL'];
    const params: unknown[] = [this.tenantId];
    appendScopeFragment(
      conditions,
      params,
      applyDepartmentScope(scopeCtx ?? { enabled: false, scopes: [] }, 'e.department_id', params.length + 1)
    );
    if (filters.employeeId) {
      params.push(filters.employeeId);
      conditions.push(`lb.employee_id = $${params.length}`);
    }
    if (filters.departmentId) {
      params.push(filters.departmentId);
      conditions.push(`e.department_id = $${params.length}`);
    }
    if (filters.year) {
      params.push(filters.year);
      conditions.push(`lb.year = $${params.length}`);
    }
    const where = conditions.join(' AND ');
    const countR = await client.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM leave_balances lb
       INNER JOIN payroll_employees e ON e.id = lb.employee_id AND e.tenant_id = lb.tenant_id
       WHERE ${where}`,
      params
    );
    const total = Number(countR.rows[0]?.cnt ?? 0);
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 100;
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const r = await client.query<LeaveBalanceWithJoin>(
      `SELECT ${LEAVE_BALANCE_WITH_JOIN}
       FROM leave_balances lb
       INNER JOIN payroll_employees e ON e.id = lb.employee_id AND e.tenant_id = lb.tenant_id
       INNER JOIN leave_types lt ON lt.id = lb.leave_type_id AND lt.tenant_id = lb.tenant_id
       WHERE ${where}
       ORDER BY e.name ASC, lt.name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { rows: r.rows, total };
  }

  async listRequestsChangedSince(client: pg.PoolClient, since: Date): Promise<LeaveRequestRow[]> {
    const r = await client.query<LeaveRequestRow>(
      `SELECT id, tenant_id, employee_id, leave_type_id, from_date, to_date, days,
         reason, attachment_url, status, approved_by, approved_at, rejection_reason,
         created_by, updated_by, created_at, updated_at, deleted_at
       FROM leave_requests WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }

  async listTypesChangedSince(client: pg.PoolClient, since: Date): Promise<LeaveTypeRow[]> {
    const r = await client.query<LeaveTypeRow>(
      `SELECT ${LEAVE_TYPE_COLUMNS} FROM leave_types WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }
}

export function calculateLeaveDays(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  if (to < from) return 0;
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
}

export function enumerateLeaveDates(fromDate: string, toDate: string): string[] {
  const dates: string[] = [];
  const cur = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}
