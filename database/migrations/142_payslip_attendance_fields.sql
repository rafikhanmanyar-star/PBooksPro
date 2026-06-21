-- Payroll V3 Sprint 3B — attendance-aware payslip fields (LOP + snapshot)

ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS working_days NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS present_days NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS leave_days NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS paid_leave_days NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS unpaid_leave_days NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS absent_days NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS half_days NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS lop_days NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS lop_deduction NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjusted_basic NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS attendance_summary_snapshot JSONB;

CREATE INDEX IF NOT EXISTS idx_payslips_tenant_lop
  ON payslips (tenant_id, payroll_run_id)
  WHERE deleted_at IS NULL AND COALESCE(lop_days, 0) > 0;
