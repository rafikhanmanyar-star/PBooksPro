-- Remove Payroll Departments Table Migration (Rollback)
-- This migration removes the departments table and related changes

-- =====================================================
-- DROP VIEW
-- =====================================================
DROP VIEW IF EXISTS payroll_employees_with_department;

-- =====================================================
-- DROP MIGRATION FUNCTION
-- =====================================================
DROP FUNCTION IF EXISTS migrate_employee_departments(TEXT);

-- =====================================================
-- REMOVE DEPARTMENT_ID FROM EMPLOYEES
-- =====================================================
-- Remove the department_id column from payroll_employees
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payroll_employees' 
        AND column_name = 'department_id'
    ) THEN
        -- Drop the index first
        DROP INDEX IF EXISTS idx_payroll_employees_department_id;
        
        -- Remove the column
        ALTER TABLE payroll_employees DROP COLUMN department_id;
    END IF;
END $$;

-- =====================================================
-- DROP DEPARTMENTS TABLE
-- =====================================================
-- Drop indexes first
DROP INDEX IF EXISTS idx_payroll_departments_tenant;
DROP INDEX IF EXISTS idx_payroll_departments_parent;
DROP INDEX IF EXISTS idx_payroll_departments_active;
DROP INDEX IF EXISTS idx_payroll_departments_code;

-- Drop RLS policy
DROP POLICY IF EXISTS payroll_departments_tenant_isolation ON payroll_departments;

-- Drop trigger
DROP TRIGGER IF EXISTS trg_payroll_departments_updated ON payroll_departments;

-- Drop the table
DROP TABLE IF EXISTS payroll_departments;
