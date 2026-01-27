-- Migration: Remove Payroll System Tables
-- Date: 2026-01-20
-- Description: Drops all payroll-related tables as the payroll system has been removed from the application
-- 
-- IMPORTANT: Run this migration AFTER ensuring no critical payroll data needs to be preserved.
-- This migration is DESTRUCTIVE and cannot be undone.

-- ============================================================================
-- DROP RLS POLICIES (must be done before dropping tables)
-- ============================================================================

-- Salary Components
DROP POLICY IF EXISTS tenant_isolation_salary_components ON salary_components;

-- Employees
DROP POLICY IF EXISTS tenant_isolation_employees ON employees;

-- Payroll Cycles
DROP POLICY IF EXISTS tenant_isolation_payroll_cycles ON payroll_cycles;

-- Payslips
DROP POLICY IF EXISTS tenant_isolation_payslips ON payslips;

-- Legacy Payslips
DROP POLICY IF EXISTS tenant_isolation_legacy_payslips ON legacy_payslips;

-- Bonus Records
DROP POLICY IF EXISTS tenant_isolation_bonus_records ON bonus_records;

-- Payroll Adjustments
DROP POLICY IF EXISTS tenant_isolation_payroll_adjustments ON payroll_adjustments;

-- Loan Advance Records
DROP POLICY IF EXISTS tenant_isolation_loan_advance_records ON loan_advance_records;

-- Attendance Records
DROP POLICY IF EXISTS tenant_isolation_attendance_records ON attendance_records;

-- Tax Configurations
DROP POLICY IF EXISTS tenant_isolation_tax_configurations ON tax_configurations;

-- Statutory Configurations
DROP POLICY IF EXISTS tenant_isolation_statutory_configurations ON statutory_configurations;

-- Staff (legacy)
DROP POLICY IF EXISTS tenant_isolation_staff ON staff;

-- ============================================================================
-- DROP INDEXES
-- ============================================================================

-- Salary Components
DROP INDEX IF EXISTS idx_salary_components_tenant_id;

-- Employees
DROP INDEX IF EXISTS idx_employees_tenant_id;
DROP INDEX IF EXISTS idx_employees_user_id;
DROP INDEX IF EXISTS idx_employees_employee_id;

-- Payroll Cycles
DROP INDEX IF EXISTS idx_payroll_cycles_tenant_id;
DROP INDEX IF EXISTS idx_payroll_cycles_user_id;

-- Payslips
DROP INDEX IF EXISTS idx_payslips_tenant_id;
DROP INDEX IF EXISTS idx_payslips_user_id;
DROP INDEX IF EXISTS idx_payslips_employee_id;
DROP INDEX IF EXISTS idx_payslips_payroll_cycle_id;

-- Legacy Payslips
DROP INDEX IF EXISTS idx_legacy_payslips_tenant_id;

-- Bonus Records
DROP INDEX IF EXISTS idx_bonus_records_tenant_id;
DROP INDEX IF EXISTS idx_bonus_records_employee_id;

-- Payroll Adjustments
DROP INDEX IF EXISTS idx_payroll_adjustments_tenant_id;
DROP INDEX IF EXISTS idx_payroll_adjustments_employee_id;

-- Loan Advance Records
DROP INDEX IF EXISTS idx_loan_advance_records_tenant_id;
DROP INDEX IF EXISTS idx_loan_advance_records_employee_id;

-- Attendance Records
DROP INDEX IF EXISTS idx_attendance_records_tenant_id;
DROP INDEX IF EXISTS idx_attendance_records_employee_id;
DROP INDEX IF EXISTS idx_attendance_records_date;

-- Tax Configurations
DROP INDEX IF EXISTS idx_tax_configurations_tenant_id;

-- Statutory Configurations
DROP INDEX IF EXISTS idx_statutory_configurations_tenant_id;

-- ============================================================================
-- DROP TABLES (in correct order to respect foreign key constraints)
-- ============================================================================

-- First, drop tables that reference other payroll tables

-- Attendance Records (references employees)
DROP TABLE IF EXISTS attendance_records CASCADE;

-- Bonus Records (references employees, payroll_cycles)
DROP TABLE IF EXISTS bonus_records CASCADE;

-- Payroll Adjustments (references employees, payroll_cycles)
DROP TABLE IF EXISTS payroll_adjustments CASCADE;

-- Loan Advance Records (references employees)
DROP TABLE IF EXISTS loan_advance_records CASCADE;

-- Payslips (references employees, payroll_cycles)
DROP TABLE IF EXISTS payslips CASCADE;

-- Legacy Payslips (references contacts)
DROP TABLE IF EXISTS legacy_payslips CASCADE;

-- Now drop parent tables

-- Payroll Cycles
DROP TABLE IF EXISTS payroll_cycles CASCADE;

-- Employees (references contacts)
DROP TABLE IF EXISTS employees CASCADE;

-- Salary Components
DROP TABLE IF EXISTS salary_components CASCADE;

-- Tax Configurations
DROP TABLE IF EXISTS tax_configurations CASCADE;

-- Statutory Configurations
DROP TABLE IF EXISTS statutory_configurations CASCADE;

-- Staff (legacy table)
DROP TABLE IF EXISTS staff CASCADE;

-- ============================================================================
-- OPTIONAL: Remove payroll-related system categories from existing tenants
-- (Only run if you want to clean up the categories table)
-- ============================================================================

-- DELETE FROM categories WHERE id IN (
--     'sys-cat-emp-sal',
--     'sys-cat-payroll-tax',
--     'sys-cat-emp-benefits',
--     'sys-cat-emp-allow',
--     'sys-cat-emp-deduct',
--     'sys-cat-pf-expense',
--     'sys-cat-esi-expense',
--     'sys-cat-emp-insurance',
--     'sys-cat-bonus-inc',
--     'sys-cat-overtime',
--     'sys-cat-commission',
--     'sys-cat-gratuity',
--     'sys-cat-leave-encash',
--     'sys-cat-termination-settle',
--     'sys-cat-payroll-processing'
-- );

-- ============================================================================
-- NOTE: The transactions table still has a payslip_id column
-- This column is kept for backward compatibility with existing transaction data
-- that may have been linked to payslips before the payroll system was removed.
-- The column can be safely ignored or removed in a future migration if desired.
-- ============================================================================

-- Optional: Remove the payslip_id column from transactions table
-- WARNING: Only run this if you're sure no historical data references payslips
-- ALTER TABLE transactions DROP COLUMN IF EXISTS payslip_id;
