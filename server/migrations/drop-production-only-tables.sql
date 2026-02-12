-- Drop tables that exist in production but not in staging
-- Generated: 2026-02-12T05:14:48.643Z
-- DESTRUCTIVE: Backup production before running.
-- Uses CASCADE to drop dependent objects (e.g. FKs, views).

BEGIN;

DROP TABLE IF EXISTS public.attendance_records CASCADE;
DROP TABLE IF EXISTS public.bonus_records CASCADE;
DROP TABLE IF EXISTS public.employees CASCADE;
DROP TABLE IF EXISTS public.legacy_payslips CASCADE;
DROP TABLE IF EXISTS public.loan_advance_records CASCADE;
DROP TABLE IF EXISTS public.payroll_adjustments CASCADE;
DROP TABLE IF EXISTS public.payroll_cycles CASCADE;
DROP TABLE IF EXISTS public.salary_components CASCADE;
DROP TABLE IF EXISTS public.statutory_configurations CASCADE;
DROP TABLE IF EXISTS public.tax_configurations CASCADE;

COMMIT;

-- End of script.