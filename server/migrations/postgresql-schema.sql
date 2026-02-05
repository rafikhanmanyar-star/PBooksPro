-- PostgreSQL Database Schema for PBooksPro
-- Consolidated Idempotent Schema
-- Created: 2026-02-03
-- Multi-tenant architecture with Row Level Security

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. TENANTS & LICENSING
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    company_name TEXT,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    address TEXT,
    subdomain TEXT UNIQUE,
    license_type TEXT NOT NULL DEFAULT 'trial',
    license_status TEXT NOT NULL DEFAULT 'active',
    license_key TEXT UNIQUE,
    trial_start_date TIMESTAMP,
    license_start_date TIMESTAMP,
    license_expiry_date TIMESTAMP,
    last_renewal_date TIMESTAMP,
    next_renewal_date TIMESTAMP,
    max_users INTEGER DEFAULT 20,
    max_projects INTEGER DEFAULT 10,
    subscription_tier TEXT DEFAULT 'free',
    is_supplier BOOLEAN NOT NULL DEFAULT FALSE,
    tax_id TEXT,
    payment_terms TEXT,
    supplier_category TEXT,
    supplier_status TEXT DEFAULT 'Active',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    settings JSONB DEFAULT '{}'::jsonb
);

-- Fix-up for existing tenants table
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='is_supplier') THEN
        ALTER TABLE tenants ADD COLUMN is_supplier BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='max_users') THEN
        ALTER TABLE tenants ADD COLUMN max_users INTEGER DEFAULT 20;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS license_keys (
    id TEXT PRIMARY KEY,
    license_key TEXT UNIQUE NOT NULL,
    tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    license_type TEXT NOT NULL,
    device_id TEXT,
    issued_date TIMESTAMP NOT NULL DEFAULT NOW(),
    activated_date TIMESTAMP,
    expiry_date TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'pending',
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_name TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
    execution_time_ms INTEGER,
    notes TEXT
);

-- ============================================================================
-- 2. USERS & AUTHENTICATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    password TEXT,
    email TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    login_status BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, username)
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='login_status') THEN
        ALTER TABLE users ADD COLUMN login_status BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, tenant_id)
);

-- ============================================================================
-- 3. FINANCIAL CORE
-- ============================================================================

CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    is_permanent BOOLEAN NOT NULL DEFAULT FALSE,
    parent_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    contact_no TEXT,
    company_name TEXT,
    address TEXT,
    user_id TEXT REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    contact_no TEXT,
    company_name TEXT,
    address TEXT,
    description TEXT,
    user_id TEXT REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    is_permanent BOOLEAN NOT NULL DEFAULT FALSE,
    is_rental BOOLEAN NOT NULL DEFAULT FALSE,
    parent_category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    date DATE NOT NULL,
    description TEXT,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
    project_id TEXT,
    invoice_id TEXT,
    bill_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='user_id') THEN
        ALTER TABLE transactions ADD COLUMN user_id TEXT REFERENCES users(id);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    amount DECIMAL(15, 2) NOT NULL,
    status TEXT NOT NULL,
    module_key TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. REAL ESTATE & AGREEMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS buildings (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL REFERENCES contacts(id),
    building_id TEXT NOT NULL REFERENCES buildings(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS units (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contact_id TEXT REFERENCES contacts(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,
    contact_id TEXT NOT NULL REFERENCES contacts(id),
    amount DECIMAL(15, 2) NOT NULL,
    paid_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    invoice_type TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bill_number TEXT NOT NULL,
    contact_id TEXT NOT NULL REFERENCES contacts(id),
    amount DECIMAL(15, 2) NOT NULL,
    paid_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Unpaid',
    issue_date DATE NOT NULL,
    bill_version INTEGER DEFAULT 1,
    document_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, bill_number)
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bills' AND column_name='bill_version') THEN
        ALTER TABLE bills ADD COLUMN bill_version INTEGER DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bills' AND column_name='document_id') THEN
        ALTER TABLE bills ADD COLUMN document_id TEXT;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS rental_agreements (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agreement_number TEXT NOT NULL,
    contact_id TEXT NOT NULL REFERENCES contacts(id),
    property_id TEXT NOT NULL REFERENCES properties(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    monthly_rent DECIMAL(15, 2) NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, agreement_number)
);

-- Fix for org_id vs tenant_id in existing agreements
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='rental_agreements' AND column_name='org_id') THEN
        ALTER TABLE rental_agreements ADD COLUMN org_id TEXT REFERENCES tenants(id);
        UPDATE rental_agreements SET org_id = tenant_id WHERE org_id IS NULL; -- assuming tenant_id was there
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS project_agreements (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agreement_number TEXT NOT NULL,
    client_id TEXT NOT NULL REFERENCES contacts(id),
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    selling_price DECIMAL(15, 2) NOT NULL,
    status TEXT NOT NULL,
    installment_plan JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, agreement_number)
);

CREATE TABLE IF NOT EXISTS installment_plans (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    lead_id TEXT NOT NULL REFERENCES contacts(id),
    unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    net_value DECIMAL(15, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'Draft',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contract_number TEXT NOT NULL,
    name TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    vendor_id TEXT NOT NULL REFERENCES contacts(id),
    total_amount DECIMAL(15, 2) NOT NULL,
    status TEXT NOT NULL,
    user_id TEXT REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, contract_number)
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contracts' AND column_name='user_id') THEN
        ALTER TABLE contracts ADD COLUMN user_id TEXT REFERENCES users(id);
    END IF;
END $$;

-- ============================================================================
-- 5. INVENTORY & SUPPLY CHAIN
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_batches (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    inventory_item_id TEXT NOT NULL,
    batch_number TEXT NOT NULL,
    quantity DECIMAL(15, 3) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 6. INVESTMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS investments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    investor_account_id TEXT NOT NULL REFERENCES accounts(id),
    status TEXT NOT NULL DEFAULT 'Active',
    principal_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 7. PROCUREMENT & P2P
-- ============================================================================

CREATE TABLE IF NOT EXISTS purchase_orders (
    id TEXT PRIMARY KEY,
    po_number TEXT NOT NULL UNIQUE,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    buyer_tenant_id TEXT NOT NULL REFERENCES tenants(id),
    supplier_tenant_id TEXT NOT NULL REFERENCES tenants(id),
    total_amount DECIMAL(15, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS p2p_invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT NOT NULL UNIQUE,
    po_id TEXT NOT NULL REFERENCES purchase_orders(id),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    amount DECIMAL(15, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 8. TASKS MODULE
-- ============================================================================

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    description TEXT,
    status TEXT NOT NULL DEFAULT 'Not Started',
    assigned_to_id TEXT REFERENCES users(id),
    user_id TEXT REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 9. SHOP & POS MODULE
-- ============================================================================

CREATE TABLE IF NOT EXISTS shop_branches (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS shop_products (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sku TEXT NOT NULL,
    retail_price DECIMAL(15, 2) DEFAULT 0,
    UNIQUE(tenant_id, sku)
);

CREATE TABLE IF NOT EXISTS shop_sales (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sale_number TEXT NOT NULL,
    grand_total DECIMAL(15, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'Completed',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, sale_number)
);

-- ============================================================================
-- 10. PAYROLL MODULE
-- ============================================================================

-- Payroll Departments table
CREATE TABLE IF NOT EXISTS payroll_departments (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    description TEXT,
    parent_department_id TEXT REFERENCES payroll_departments(id) ON DELETE SET NULL,
    head_employee_id TEXT,
    cost_center_code TEXT,
    budget_allocation DECIMAL(15, 2) DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by TEXT,
    updated_by TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_departments_tenant ON payroll_departments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payroll_departments_parent ON payroll_departments(parent_department_id);
CREATE INDEX IF NOT EXISTS idx_payroll_departments_active ON payroll_departments(tenant_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_departments_name_unique ON payroll_departments(tenant_id, name);

-- Payroll Grade Levels table
CREATE TABLE IF NOT EXISTS payroll_grades (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    min_salary DECIMAL(15, 2) NOT NULL DEFAULT 0,
    max_salary DECIMAL(15, 2) NOT NULL DEFAULT 0,
    created_by TEXT,
    updated_by TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_grades_tenant ON payroll_grades(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_grades_name_unique ON payroll_grades(tenant_id, name);

-- Payroll Employees table
CREATE TABLE IF NOT EXISTS payroll_employees (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id TEXT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    photo TEXT,
    employee_code TEXT,
    designation TEXT NOT NULL,
    department TEXT NOT NULL,
    department_id TEXT REFERENCES payroll_departments(id) ON DELETE SET NULL,
    grade TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RESIGNED', 'TERMINATED', 'ON_LEAVE')),
    joining_date DATE NOT NULL,
    termination_date DATE,
    salary JSONB NOT NULL DEFAULT '{"basic": 0, "allowances": [], "deductions": []}'::jsonb,
    adjustments JSONB DEFAULT '[]'::jsonb,
    projects JSONB DEFAULT '[]'::jsonb,
    created_by TEXT NOT NULL,
    updated_by TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_employees_tenant ON payroll_employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payroll_employees_status ON payroll_employees(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_payroll_employees_department ON payroll_employees(tenant_id, department);
CREATE INDEX IF NOT EXISTS idx_payroll_employees_department_id ON payroll_employees(department_id);
CREATE INDEX IF NOT EXISTS idx_payroll_employees_code ON payroll_employees(tenant_id, employee_code);

-- Payroll Runs table
CREATE TABLE IF NOT EXISTS payroll_runs (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    year INTEGER NOT NULL,
    period_start DATE,
    period_end DATE,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PROCESSING', 'APPROVED', 'PAID', 'CANCELLED')),
    total_amount DECIMAL(15, 2) DEFAULT 0,
    employee_count INTEGER DEFAULT 0,
    created_by TEXT NOT NULL,
    updated_by TEXT,
    approved_by TEXT,
    approved_at TIMESTAMP,
    paid_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_tenant ON payroll_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON payroll_runs(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON payroll_runs(tenant_id, year, month);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_runs_unique ON payroll_runs(tenant_id, month, year);

-- Payslips table
CREATE TABLE IF NOT EXISTS payslips (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    payroll_run_id TEXT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
    employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE CASCADE,
    basic_pay DECIMAL(15, 2) NOT NULL DEFAULT 0,
    total_allowances DECIMAL(15, 2) NOT NULL DEFAULT 0,
    total_deductions DECIMAL(15, 2) NOT NULL DEFAULT 0,
    total_adjustments DECIMAL(15, 2) NOT NULL DEFAULT 0,
    gross_pay DECIMAL(15, 2) NOT NULL DEFAULT 0,
    net_pay DECIMAL(15, 2) NOT NULL DEFAULT 0,
    allowance_details JSONB DEFAULT '[]'::jsonb,
    deduction_details JSONB DEFAULT '[]'::jsonb,
    adjustment_details JSONB DEFAULT '[]'::jsonb,
    is_paid BOOLEAN DEFAULT FALSE,
    paid_at TIMESTAMP,
    transaction_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payslips_tenant ON payslips(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payslips_run ON payslips(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payslips_employee ON payslips(employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payslips_unique ON payslips(payroll_run_id, employee_id);

-- Payroll Salary Components table
CREATE TABLE IF NOT EXISTS payroll_salary_components (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('ALLOWANCE', 'DEDUCTION')),
    is_percentage BOOLEAN DEFAULT FALSE,
    default_value DECIMAL(15, 2) DEFAULT 0,
    is_taxable BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_components_tenant ON payroll_salary_components(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_components_unique ON payroll_salary_components(tenant_id, name, type);

-- ============================================================================
-- 11. SYSTEMS & MODULES
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_modules (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    UNIQUE(tenant_id, module_key)
);

CREATE TABLE IF NOT EXISTS marketplace_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_configs (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    api_key TEXT NOT NULL,
    phone_number_id TEXT NOT NULL,
    UNIQUE(tenant_id)
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    value JSONB NOT NULL,
    PRIMARY KEY (tenant_id, key)
);

-- ============================================================================
-- 12. ROW LEVEL SECURITY
-- ============================================================================

CREATE OR REPLACE FUNCTION get_current_tenant_id() RETURNS TEXT AS $$
    SELECT current_setting('app.current_tenant_id', TRUE);
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN 
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name NOT IN ('tenants', 'schema_migrations', 'admin_users', 'marketplace_categories')
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.table_name);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t.table_name);
        
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t.table_name AND column_name = 'tenant_id') THEN
            EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id())', t.table_name);
        ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t.table_name AND column_name = 'org_id') THEN
            EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL USING (org_id = get_current_tenant_id()) WITH CHECK (org_id = get_current_tenant_id())', t.table_name);
        END IF;
    END LOOP;
END $$;

-- ============================================================================
-- 13. SEEDING
-- ============================================================================

INSERT INTO marketplace_categories (id, name, icon) VALUES
('real-estate', 'Home', 'Home'),
('vehicles', 'Car', 'Car'),
('electronics', 'Smartphone', 'Smartphone'),
('furniture', 'Armchair', 'Armchair'),
('jobs', 'Briefcase', 'Briefcase'),
('services', 'Settings', 'Settings'),
('other', 'MoreHorizontal', 'MoreHorizontal')
ON CONFLICT (id) DO NOTHING;
