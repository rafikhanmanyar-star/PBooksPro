-- Payslips use soft delete (deleted_at). The original UNIQUE (payroll_run_id, employee_id)
-- applied to all rows, so a soft-deleted payslip blocked re-creating salary for the same period
-- (duplicate key uq_payslips_run_employee). Uniqueness should only apply to active rows.
ALTER TABLE payslips DROP CONSTRAINT IF EXISTS uq_payslips_run_employee;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payslips_run_employee_active
  ON payslips (payroll_run_id, employee_id)
  WHERE deleted_at IS NULL;
