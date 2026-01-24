-- Migration: Remove test/demo payroll data
-- Description: Removes test employees and payroll runs from the database
-- Run this to clean up any test data that may have been created

-- ============================================================================
-- REMOVE TEST EMPLOYEES
-- ============================================================================
-- Remove employees with test/demo names or IDs
DELETE FROM payroll_employees 
WHERE 
  -- Remove employees with demo/test indicators in name
  LOWER(name) LIKE '%test%' 
  OR LOWER(name) LIKE '%demo%'
  OR LOWER(name) LIKE '%sample%'
  OR LOWER(name) LIKE '%dummy%'
  -- Remove employees with demo IDs
  OR id LIKE 'emp-demo-%'
  OR id LIKE 'emp-test-%'
  OR employee_code LIKE 'EID-TEST%'
  OR employee_code LIKE 'EID-DEMO%'
  -- Remove specific test employees (Ahmad Khan, Sara Ahmed from demo data)
  OR (name = 'Ahmad Khan' AND email = 'ahmad.khan@company.com')
  OR (name = 'Sara Ahmed' AND email = 'sara.ahmed@company.com');

-- ============================================================================
-- REMOVE TEST PAYROLL RUNS
-- ============================================================================
-- Remove payroll runs with demo/test IDs
DELETE FROM payroll_runs 
WHERE 
  id LIKE 'run-demo-%'
  OR id LIKE 'run-test-%'
  -- Remove runs created by system user (demo data)
  OR (created_by = 'system' AND month = 'December' AND year = 2025)
  OR (created_by = 'system' AND month = 'January' AND year = 2026);

-- ============================================================================
-- REMOVE PAYSLIPS FOR DELETED EMPLOYEES/RUNS
-- ============================================================================
-- This will be handled by CASCADE DELETE, but we can also clean up orphaned payslips
DELETE FROM payslips 
WHERE 
  employee_id NOT IN (SELECT id FROM payroll_employees)
  OR payroll_run_id NOT IN (SELECT id FROM payroll_runs);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Check remaining employees (should not have test data)
SELECT 
  'Remaining Employees' as check_type,
  COUNT(*) as count,
  STRING_AGG(name, ', ') as names
FROM payroll_employees;

-- Check remaining payroll runs (should not have test data)
SELECT 
  'Remaining Payroll Runs' as check_type,
  COUNT(*) as count,
  STRING_AGG(month || ' ' || year::text, ', ') as runs
FROM payroll_runs;
