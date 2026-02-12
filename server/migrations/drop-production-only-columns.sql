-- Drop columns that exist in production but not in staging
-- Generated: 2026-02-12T05:26:07.385Z
-- DESTRUCTIVE: Backup production before running. Data in these columns will be lost.

BEGIN;

ALTER TABLE public.payslips DROP COLUMN IF EXISTS user_id, DROP COLUMN IF EXISTS payroll_cycle_id, DROP COLUMN IF EXISTS month, DROP COLUMN IF EXISTS issue_date, DROP COLUMN IF EXISTS pay_period_start, DROP COLUMN IF EXISTS pay_period_end, DROP COLUMN IF EXISTS basic_salary, DROP COLUMN IF EXISTS allowances, DROP COLUMN IF EXISTS bonuses, DROP COLUMN IF EXISTS total_bonuses, DROP COLUMN IF EXISTS overtime, DROP COLUMN IF EXISTS total_overtime, DROP COLUMN IF EXISTS commissions, DROP COLUMN IF EXISTS total_commissions, DROP COLUMN IF EXISTS deductions, DROP COLUMN IF EXISTS tax_deductions, DROP COLUMN IF EXISTS total_tax, DROP COLUMN IF EXISTS statutory_deductions, DROP COLUMN IF EXISTS total_statutory, DROP COLUMN IF EXISTS loan_deductions, DROP COLUMN IF EXISTS total_loan_deductions, DROP COLUMN IF EXISTS gross_salary, DROP COLUMN IF EXISTS taxable_income, DROP COLUMN IF EXISTS net_salary, DROP COLUMN IF EXISTS cost_allocations, DROP COLUMN IF EXISTS is_prorated, DROP COLUMN IF EXISTS proration_days, DROP COLUMN IF EXISTS proration_reason, DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS paid_amount, DROP COLUMN IF EXISTS payment_date, DROP COLUMN IF EXISTS payment_account_id, DROP COLUMN IF EXISTS generated_at, DROP COLUMN IF EXISTS generated_by, DROP COLUMN IF EXISTS approved_at, DROP COLUMN IF EXISTS approved_by, DROP COLUMN IF EXISTS notes, DROP COLUMN IF EXISTS snapshot;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS "text", DROP COLUMN IF EXISTS "completed", DROP COLUMN IF EXISTS "priority";

COMMIT;

-- End of script.