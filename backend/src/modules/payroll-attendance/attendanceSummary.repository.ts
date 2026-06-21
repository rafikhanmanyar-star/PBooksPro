import type pg from 'pg';
import { randomUUID } from 'crypto';
import { TenantRepository } from '../../core/TenantRepository.js';
import type { DataScopeEnforcementContext } from '../../auth/tenantRepositoryScope.js';
import {
  appendScopeFragment,
  applyDepartmentScope,
} from '../../auth/tenantRepositoryScope.js';
import type {
  AggregatedAttendanceRow,
  PayrollAttendanceSummaryListFilters,
  PayrollAttendanceSummaryRow,
  PayrollAttendanceSummaryWithEmployee,
} from './attendanceSummary.types.js';

const SUMMARY_COLUMNS = `pas.id, pas.tenant_id, pas.employee_id, pas.payroll_month, pas.payroll_year,
  pas.working_days, pas.present_days, pas.leave_days, pas.paid_leave_days, pas.unpaid_leave_days,
  pas.absent_days, pas.half_days, pas.late_days, pas.lop_days, pas.created_at, pas.updated_at`;

const SUMMARY_WITH_EMP = `${SUMMARY_COLUMNS},
  e.name AS employee_name, e.employee_code, e.department, e.department_id`;

export class PayrollAttendanceSummaryRepository extends TenantRepository {
  constructor(tenantId: string) {
    super(tenantId);
  }

  async aggregateAttendanceForPeriod(
    client: pg.PoolClient,
    periodStart: string,
    periodEnd: string,
    scopeCtx?: DataScopeEnforcementContext
  ): Promise<AggregatedAttendanceRow[]> {
    const conditions = ['e.tenant_id = $1', 'e.deleted_at IS NULL', "e.status = 'ACTIVE'"];
    const params: unknown[] = [this.tenantId, periodStart, periodEnd];
    appendScopeFragment(
      conditions,
      params,
      applyDepartmentScope(scopeCtx ?? { enabled: false, scopes: [] }, 'e.department_id', params.length + 1)
    );
    const r = await client.query<AggregatedAttendanceRow>(
      `SELECT e.id AS employee_id,
         COALESCE(SUM(CASE WHEN ar.status = 'PRESENT' THEN 1 ELSE 0 END), 0)::text AS present_cnt,
         COALESCE(SUM(CASE WHEN ar.status = 'ABSENT' THEN 1 ELSE 0 END), 0)::text AS absent_cnt,
         COALESCE(SUM(CASE WHEN ar.status = 'LEAVE' AND ar.is_paid_leave IS TRUE THEN 1 ELSE 0 END), 0)::text AS paid_leave_cnt,
         COALESCE(SUM(CASE WHEN ar.status = 'LEAVE' AND (ar.is_paid_leave IS NOT TRUE) THEN 1 ELSE 0 END), 0)::text AS unpaid_leave_cnt,
         COALESCE(SUM(CASE WHEN ar.status = 'HALF_DAY' THEN 1 ELSE 0 END), 0)::text AS half_day_cnt,
         COALESCE(SUM(CASE WHEN ar.status = 'LATE' THEN 1 ELSE 0 END), 0)::text AS late_cnt
       FROM payroll_employees e
       LEFT JOIN attendance_records ar ON ar.employee_id = e.id AND ar.tenant_id = e.tenant_id
         AND ar.deleted_at IS NULL
         AND ar.attendance_date >= $2::date AND ar.attendance_date <= $3::date
       WHERE ${conditions.join(' AND ')}
       GROUP BY e.id
       ORDER BY e.name ASC`,
      params
    );
    return r.rows;
  }

  async upsertSummary(
    client: pg.PoolClient,
    row: Omit<PayrollAttendanceSummaryRow, 'created_at' | 'updated_at'>
  ): Promise<PayrollAttendanceSummaryRow> {
    const r = await client.query<PayrollAttendanceSummaryRow>(
      `INSERT INTO payroll_attendance_summaries (
         id, tenant_id, employee_id, payroll_month, payroll_year,
         working_days, present_days, leave_days, paid_leave_days, unpaid_leave_days,
         absent_days, half_days, late_days, lop_days, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())
       ON CONFLICT (tenant_id, employee_id, payroll_month, payroll_year)
       DO UPDATE SET
         working_days = EXCLUDED.working_days,
         present_days = EXCLUDED.present_days,
         leave_days = EXCLUDED.leave_days,
         paid_leave_days = EXCLUDED.paid_leave_days,
         unpaid_leave_days = EXCLUDED.unpaid_leave_days,
         absent_days = EXCLUDED.absent_days,
         half_days = EXCLUDED.half_days,
         late_days = EXCLUDED.late_days,
         lop_days = EXCLUDED.lop_days,
         updated_at = NOW()
       RETURNING id, tenant_id, employee_id, payroll_month, payroll_year,
         working_days, present_days, leave_days, paid_leave_days, unpaid_leave_days,
         absent_days, half_days, late_days, lop_days, created_at, updated_at`,
      [
        row.id,
        this.tenantId,
        row.employee_id,
        row.payroll_month,
        row.payroll_year,
        row.working_days,
        row.present_days,
        row.leave_days,
        row.paid_leave_days,
        row.unpaid_leave_days,
        row.absent_days,
        row.half_days,
        row.late_days,
        row.lop_days,
      ]
    );
    const saved = r.rows[0];
    if (!saved) throw new Error('Failed to upsert payroll attendance summary.');
    return saved;
  }

  async batchUpsertSummaries(
    client: pg.PoolClient,
    rows: Omit<PayrollAttendanceSummaryRow, 'created_at' | 'updated_at'>[]
  ): Promise<number> {
    if (rows.length === 0) return 0;
    for (const row of rows) {
      await this.upsertSummary(client, row);
    }
    return rows.length;
  }

  async listSummaries(
    client: pg.PoolClient,
    filters: PayrollAttendanceSummaryListFilters,
    scopeCtx?: DataScopeEnforcementContext
  ): Promise<{ rows: PayrollAttendanceSummaryWithEmployee[]; total: number }> {
    const conditions = [
      'pas.tenant_id = $1',
      'pas.payroll_month = $2',
      'pas.payroll_year = $3',
      'e.deleted_at IS NULL',
    ];
    const params: unknown[] = [this.tenantId, filters.payrollMonth, filters.payrollYear];
    appendScopeFragment(
      conditions,
      params,
      applyDepartmentScope(scopeCtx ?? { enabled: false, scopes: [] }, 'e.department_id', params.length + 1)
    );
    if (filters.employeeId) {
      params.push(filters.employeeId);
      conditions.push(`pas.employee_id = $${params.length}`);
    }
    if (filters.departmentId) {
      params.push(filters.departmentId);
      conditions.push(`e.department_id = $${params.length}`);
    }
    const where = conditions.join(' AND ');
    const countR = await client.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM payroll_attendance_summaries pas
       INNER JOIN payroll_employees e ON e.id = pas.employee_id AND e.tenant_id = pas.tenant_id
       WHERE ${where}`,
      params
    );
    const total = Number(countR.rows[0]?.cnt ?? 0);
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 500;
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const r = await client.query<PayrollAttendanceSummaryWithEmployee>(
      `SELECT ${SUMMARY_WITH_EMP}
       FROM payroll_attendance_summaries pas
       INNER JOIN payroll_employees e ON e.id = pas.employee_id AND e.tenant_id = pas.tenant_id
       WHERE ${where}
       ORDER BY e.name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { rows: r.rows, total };
  }

  async getWorkWeek(client: pg.PoolClient): Promise<{ working_days: number[]; weekend_days: number[] }> {
    const r = await client.query<{ work_week: { working_days?: number[]; weekend_days?: number[] } | null }>(
      `SELECT work_week FROM payroll_tenant_config WHERE tenant_id = $1`,
      [this.tenantId]
    );
    const ww = r.rows[0]?.work_week;
    return {
      working_days: ww?.working_days?.length ? ww.working_days : [1, 2, 3, 4, 5, 6],
      weekend_days: ww?.weekend_days?.length ? ww.weekend_days : [0],
    };
  }

  async updateWorkWeek(
    client: pg.PoolClient,
    workWeek: { working_days: number[]; weekend_days: number[] }
  ): Promise<void> {
    await client.query(
      `INSERT INTO payroll_tenant_config (tenant_id, earning_types, deduction_types, work_week, updated_at)
       VALUES ($1, '[]'::jsonb, '[]'::jsonb, $2::jsonb, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET work_week = EXCLUDED.work_week, updated_at = NOW()`,
      [this.tenantId, JSON.stringify(workWeek)]
    );
  }

  /** Batch load stored summaries for a payroll period (Sprint 3B payslip generation). */
  async mapSummariesForPeriod(
    client: pg.PoolClient,
    payrollMonth: number,
    payrollYear: number
  ): Promise<Map<string, PayrollAttendanceSummaryRow>> {
    const r = await client.query<PayrollAttendanceSummaryRow>(
      `SELECT id, tenant_id, employee_id, payroll_month, payroll_year,
         working_days, present_days, leave_days, paid_leave_days, unpaid_leave_days,
         absent_days, half_days, late_days, lop_days, created_at, updated_at
       FROM payroll_attendance_summaries
       WHERE tenant_id = $1 AND payroll_month = $2 AND payroll_year = $3`,
      [this.tenantId, payrollMonth, payrollYear]
    );
    const map = new Map<string, PayrollAttendanceSummaryRow>();
    for (const row of r.rows) map.set(row.employee_id, row);
    return map;
  }

  async countSummariesForPeriod(
    client: pg.PoolClient,
    payrollMonth: number,
    payrollYear: number
  ): Promise<number> {
    const r = await client.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM payroll_attendance_summaries
       WHERE tenant_id = $1 AND payroll_month = $2 AND payroll_year = $3`,
      [this.tenantId, payrollMonth, payrollYear]
    );
    return Number(r.rows[0]?.cnt ?? 0);
  }
}

export function newSummaryId(): string {
  return `pas_${randomUUID().replace(/-/g, '')}`;
}

export function num(v: string | number | null | undefined): number {
  return Number(v) || 0;
}
