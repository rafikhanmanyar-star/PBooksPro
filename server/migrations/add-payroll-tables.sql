-- Payroll Module Database Schema
-- This migration adds tables for the payroll system with proper tenant isolation

-- =====================================================
-- GRADE LEVELS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS payroll_grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    description VARCHAR(255),
    min_salary NUMERIC(15, 2) NOT NULL DEFAULT 0,
    max_salary NUMERIC(15, 2) NOT NULL DEFAULT 0,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_payroll_grades_tenant ON payroll_grades(tenant_id);

-- Enable RLS
ALTER TABLE payroll_grades ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DROP POLICY IF EXISTS payroll_grades_tenant_isolation ON payroll_grades;
CREATE POLICY payroll_grades_tenant_isolation ON payroll_grades
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- =====================================================
-- PAYROLL PROJECTS TABLE (for cost allocation)
-- =====================================================
CREATE TABLE IF NOT EXISTS payroll_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    description TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'ON_HOLD')),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payroll_projects_tenant ON payroll_projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payroll_projects_status ON payroll_projects(tenant_id, status);

-- Enable RLS
ALTER TABLE payroll_projects ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DROP POLICY IF EXISTS payroll_projects_tenant_isolation ON payroll_projects;
CREATE POLICY payroll_projects_tenant_isolation ON payroll_projects
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- =====================================================
-- PAYROLL EMPLOYEES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS payroll_employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    
    -- Personal Info
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    photo TEXT,
    
    -- Employment Info
    employee_code VARCHAR(50),
    designation VARCHAR(255) NOT NULL,
    department VARCHAR(100) NOT NULL,
    grade VARCHAR(50),
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RESIGNED', 'TERMINATED', 'ON_LEAVE')),
    joining_date DATE NOT NULL,
    termination_date DATE,
    
    -- Salary & Projects (JSONB for flexibility)
    salary JSONB NOT NULL DEFAULT '{"basic": 0, "allowances": [], "deductions": []}'::jsonb,
    adjustments JSONB DEFAULT '[]'::jsonb,
    projects JSONB DEFAULT '[]'::jsonb,
    
    -- Audit
    created_by UUID NOT NULL REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payroll_employees_tenant ON payroll_employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payroll_employees_status ON payroll_employees(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_payroll_employees_department ON payroll_employees(tenant_id, department);
CREATE INDEX IF NOT EXISTS idx_payroll_employees_code ON payroll_employees(tenant_id, employee_code);

-- Enable RLS
ALTER TABLE payroll_employees ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DROP POLICY IF EXISTS payroll_employees_tenant_isolation ON payroll_employees;
CREATE POLICY payroll_employees_tenant_isolation ON payroll_employees
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- =====================================================
-- PAYROLL RUNS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS payroll_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Period Info
    month VARCHAR(20) NOT NULL,
    year INTEGER NOT NULL,
    period_start DATE,
    period_end DATE,
    
    -- Totals
    status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PROCESSING', 'APPROVED', 'PAID', 'CANCELLED')),
    total_amount NUMERIC(15, 2) DEFAULT 0,
    employee_count INTEGER DEFAULT 0,
    
    -- Audit
    created_by UUID NOT NULL REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(tenant_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_tenant ON payroll_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON payroll_runs(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON payroll_runs(tenant_id, year, month);

-- Enable RLS
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DROP POLICY IF EXISTS payroll_runs_tenant_isolation ON payroll_runs;
CREATE POLICY payroll_runs_tenant_isolation ON payroll_runs
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- =====================================================
-- PAYSLIPS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS payslips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES payroll_employees(id) ON DELETE CASCADE,
    
    -- Amounts
    basic_pay NUMERIC(15, 2) NOT NULL DEFAULT 0,
    total_allowances NUMERIC(15, 2) NOT NULL DEFAULT 0,
    total_deductions NUMERIC(15, 2) NOT NULL DEFAULT 0,
    total_adjustments NUMERIC(15, 2) NOT NULL DEFAULT 0,
    gross_pay NUMERIC(15, 2) NOT NULL DEFAULT 0,
    net_pay NUMERIC(15, 2) NOT NULL DEFAULT 0,
    
    -- Details (JSONB for breakdown)
    allowance_details JSONB DEFAULT '[]'::jsonb,
    deduction_details JSONB DEFAULT '[]'::jsonb,
    adjustment_details JSONB DEFAULT '[]'::jsonb,
    
    -- Status
    is_paid BOOLEAN DEFAULT FALSE,
    paid_at TIMESTAMP WITH TIME ZONE,
    transaction_id VARCHAR(100),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(payroll_run_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_payslips_tenant ON payslips(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payslips_run ON payslips(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payslips_employee ON payslips(employee_id);

-- Enable RLS
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DROP POLICY IF EXISTS payslips_tenant_isolation ON payslips;
CREATE POLICY payslips_tenant_isolation ON payslips
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- =====================================================
-- SALARY COMPONENT TYPES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS payroll_salary_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('ALLOWANCE', 'DEDUCTION')),
    is_percentage BOOLEAN DEFAULT FALSE,
    default_value NUMERIC(15, 2) DEFAULT 0,
    is_taxable BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, name, type)
);

CREATE INDEX IF NOT EXISTS idx_payroll_components_tenant ON payroll_salary_components(tenant_id);

-- Enable RLS
ALTER TABLE payroll_salary_components ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DROP POLICY IF EXISTS payroll_components_tenant_isolation ON payroll_salary_components;
CREATE POLICY payroll_components_tenant_isolation ON payroll_salary_components
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- =====================================================
-- TRIGGER: Update updated_at timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION update_payroll_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all payroll tables
DROP TRIGGER IF EXISTS trg_payroll_grades_updated ON payroll_grades;
CREATE TRIGGER trg_payroll_grades_updated
    BEFORE UPDATE ON payroll_grades
    FOR EACH ROW EXECUTE FUNCTION update_payroll_updated_at();

DROP TRIGGER IF EXISTS trg_payroll_projects_updated ON payroll_projects;
CREATE TRIGGER trg_payroll_projects_updated
    BEFORE UPDATE ON payroll_projects
    FOR EACH ROW EXECUTE FUNCTION update_payroll_updated_at();

DROP TRIGGER IF EXISTS trg_payroll_employees_updated ON payroll_employees;
CREATE TRIGGER trg_payroll_employees_updated
    BEFORE UPDATE ON payroll_employees
    FOR EACH ROW EXECUTE FUNCTION update_payroll_updated_at();

DROP TRIGGER IF EXISTS trg_payroll_runs_updated ON payroll_runs;
CREATE TRIGGER trg_payroll_runs_updated
    BEFORE UPDATE ON payroll_runs
    FOR EACH ROW EXECUTE FUNCTION update_payroll_updated_at();

DROP TRIGGER IF EXISTS trg_payslips_updated ON payslips;
CREATE TRIGGER trg_payslips_updated
    BEFORE UPDATE ON payslips
    FOR EACH ROW EXECUTE FUNCTION update_payroll_updated_at();

DROP TRIGGER IF EXISTS trg_payroll_components_updated ON payroll_salary_components;
CREATE TRIGGER trg_payroll_components_updated
    BEFORE UPDATE ON payroll_salary_components
    FOR EACH ROW EXECUTE FUNCTION update_payroll_updated_at();

-- =====================================================
-- INSERT DEFAULT SALARY COMPONENTS (to be run per tenant)
-- =====================================================
-- This would be handled at application level during tenant onboarding
