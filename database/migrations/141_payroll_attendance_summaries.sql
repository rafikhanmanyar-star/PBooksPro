-- Payroll V3 Sprint 3A — attendance summaries + LOP foundation (no payslip/salary impact)

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS is_paid_leave BOOLEAN;

-- Backfill paid/unpaid from leave types (one-time; payroll never reads leave_requests at runtime)
UPDATE attendance_records ar
SET is_paid_leave = lt.paid_leave
FROM leave_requests lr
INNER JOIN leave_types lt ON lt.id = lr.leave_type_id AND lt.tenant_id = lr.tenant_id
WHERE ar.leave_request_id = lr.id
  AND ar.status = 'LEAVE'
  AND ar.is_paid_leave IS NULL;

ALTER TABLE payroll_tenant_config
  ADD COLUMN IF NOT EXISTS work_week JSONB NOT NULL DEFAULT '{"working_days":[1,2,3,4,5,6],"weekend_days":[0]}'::jsonb;

CREATE TABLE IF NOT EXISTS payroll_attendance_summaries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE CASCADE,
  payroll_month INTEGER NOT NULL,
  payroll_year INTEGER NOT NULL,
  working_days NUMERIC(6, 2) NOT NULL DEFAULT 0,
  present_days NUMERIC(6, 2) NOT NULL DEFAULT 0,
  leave_days NUMERIC(6, 2) NOT NULL DEFAULT 0,
  paid_leave_days NUMERIC(6, 2) NOT NULL DEFAULT 0,
  unpaid_leave_days NUMERIC(6, 2) NOT NULL DEFAULT 0,
  absent_days NUMERIC(6, 2) NOT NULL DEFAULT 0,
  half_days NUMERIC(6, 2) NOT NULL DEFAULT 0,
  late_days NUMERIC(6, 2) NOT NULL DEFAULT 0,
  lop_days NUMERIC(6, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payroll_attendance_summaries_month_range CHECK (payroll_month >= 1 AND payroll_month <= 12)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_attendance_summaries_period
  ON payroll_attendance_summaries (tenant_id, employee_id, payroll_month, payroll_year);

CREATE INDEX IF NOT EXISTS idx_payroll_attendance_summaries_tenant_period
  ON payroll_attendance_summaries (tenant_id, payroll_year, payroll_month);

CREATE INDEX IF NOT EXISTS idx_attendance_records_tenant_employee_date
  ON attendance_records (tenant_id, employee_id, attendance_date)
  WHERE deleted_at IS NULL;
