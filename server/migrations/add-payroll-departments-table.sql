-- Payroll Departments Table Migration
-- This migration adds a dedicated departments table for the payroll system
-- with proper normalization and linking to employee profiles

-- =====================================================
-- PAYROLL DEPARTMENTS TABLE
-- =====================================================
-- This table stores department information for the payroll workforce module
-- Departments are linked to employees via department_id foreign key

CREATE TABLE IF NOT EXISTS payroll_departments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Department Information
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20),                      -- Short code for department (e.g., 'ENG', 'HR', 'FIN')
    description VARCHAR(500),
    
    -- Hierarchy Support (for organizational structure)
    parent_department_id TEXT REFERENCES payroll_departments(id) ON DELETE SET NULL,
    
    -- Department Head (links to payroll employee or user)
    head_employee_id TEXT,                 -- Optional: Department head reference
    
    -- Cost Center Integration
    cost_center_code VARCHAR(50),          -- For accounting integration
    budget_allocation NUMERIC(15, 2) DEFAULT 0,  -- Department budget
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit Fields
    created_by TEXT REFERENCES users(id),
    updated_by TEXT REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(tenant_id, name),
    UNIQUE(tenant_id, code)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payroll_departments_tenant ON payroll_departments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payroll_departments_parent ON payroll_departments(parent_department_id);
CREATE INDEX IF NOT EXISTS idx_payroll_departments_active ON payroll_departments(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_payroll_departments_code ON payroll_departments(tenant_id, code);

-- Enable Row Level Security
ALTER TABLE payroll_departments ENABLE ROW LEVEL SECURITY;

-- RLS Policy for tenant isolation
DROP POLICY IF EXISTS payroll_departments_tenant_isolation ON payroll_departments;
CREATE POLICY payroll_departments_tenant_isolation ON payroll_departments
    USING (tenant_id = current_setting('app.current_tenant', true));

-- =====================================================
-- UPDATE EMPLOYEES TABLE TO LINK WITH DEPARTMENTS
-- =====================================================
-- Add department_id column to payroll_employees for proper normalization
-- The existing 'department' VARCHAR column is kept for backward compatibility

-- Add department_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payroll_employees' 
        AND column_name = 'department_id'
    ) THEN
        ALTER TABLE payroll_employees 
        ADD COLUMN department_id TEXT REFERENCES payroll_departments(id) ON DELETE SET NULL;
        
        -- Create index for department lookups
        CREATE INDEX IF NOT EXISTS idx_payroll_employees_department_id 
        ON payroll_employees(department_id);
    END IF;
END $$;

-- =====================================================
-- TRIGGER: Update updated_at timestamp
-- =====================================================
DROP TRIGGER IF EXISTS trg_payroll_departments_updated ON payroll_departments;
CREATE TRIGGER trg_payroll_departments_updated
    BEFORE UPDATE ON payroll_departments
    FOR EACH ROW EXECUTE FUNCTION update_payroll_updated_at();

-- =====================================================
-- MIGRATION HELPER: Link existing employees to departments
-- =====================================================
-- This function can be called to migrate existing employee department names
-- to the new normalized department_id structure

CREATE OR REPLACE FUNCTION migrate_employee_departments(p_tenant_id TEXT)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    -- Create departments from existing employee department names
    INSERT INTO payroll_departments (tenant_id, name, is_active, created_by)
    SELECT DISTINCT 
        p_tenant_id,
        e.department,
        true,
        e.created_by
    FROM payroll_employees e
    WHERE e.tenant_id = p_tenant_id
    AND e.department IS NOT NULL
    AND e.department != ''
    AND NOT EXISTS (
        SELECT 1 FROM payroll_departments d 
        WHERE d.tenant_id = p_tenant_id 
        AND d.name = e.department
    )
    ON CONFLICT (tenant_id, name) DO NOTHING;
    
    -- Update employees with department_id
    UPDATE payroll_employees e
    SET department_id = d.id
    FROM payroll_departments d
    WHERE e.tenant_id = p_tenant_id
    AND d.tenant_id = p_tenant_id
    AND e.department = d.name
    AND e.department_id IS NULL;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VIEW: Employee with Department Details
-- =====================================================
-- This view provides a convenient way to fetch employees with full department info

CREATE OR REPLACE VIEW payroll_employees_with_department AS
SELECT 
    e.*,
    d.name as department_name,
    d.code as department_code,
    d.description as department_description,
    d.cost_center_code,
    d.parent_department_id,
    pd.name as parent_department_name
FROM payroll_employees e
LEFT JOIN payroll_departments d ON e.department_id = d.id
LEFT JOIN payroll_departments pd ON d.parent_department_id = pd.id;

-- =====================================================
-- INSERT DEFAULT DEPARTMENTS (per tenant on first use)
-- =====================================================
-- This is handled at application level during tenant onboarding
-- Example default departments:
-- Engineering, Product, Sales, Human Resources, Operations, Finance, Marketing

COMMENT ON TABLE payroll_departments IS 'Stores department information for payroll workforce management with tenant isolation';
COMMENT ON COLUMN payroll_departments.parent_department_id IS 'References parent department for hierarchical organization structure';
COMMENT ON COLUMN payroll_departments.cost_center_code IS 'Cost center code for accounting and budgeting integration';
COMMENT ON COLUMN payroll_departments.head_employee_id IS 'Employee ID of department head (can reference payroll_employees.id)';
