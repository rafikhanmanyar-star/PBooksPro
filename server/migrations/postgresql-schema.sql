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
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
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
    vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
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
    contact_id TEXT REFERENCES contacts(id),
    vendor_id TEXT REFERENCES vendors(id),
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
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bills' AND column_name='expense_bearer_type') THEN
        ALTER TABLE bills ADD COLUMN expense_bearer_type TEXT;
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
    previous_agreement_id TEXT,
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
    vendor_id TEXT NOT NULL REFERENCES vendors(id),
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
    type TEXT NOT NULL DEFAULT 'Flagship',
    status TEXT NOT NULL DEFAULT 'Active',
    location TEXT,
    region TEXT,
    manager_name TEXT,
    contact_no TEXT,
    timezone TEXT DEFAULT 'GMT+5',
    open_time TIME,
    close_time TIME,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS shop_terminals (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id TEXT NOT NULL REFERENCES shop_branches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Online',
    version TEXT,
    last_sync TIMESTAMP,
    ip_address TEXT,
    health_score INTEGER DEFAULT 100,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS shop_warehouses (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    location TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS shop_products (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sku TEXT NOT NULL,
    barcode TEXT,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    unit TEXT DEFAULT 'pcs',
    cost_price DECIMAL(15, 2) DEFAULT 0,
    retail_price DECIMAL(15, 2) DEFAULT 0,
    tax_rate DECIMAL(5, 2) DEFAULT 0,
    reorder_point INTEGER DEFAULT 10,
    image_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, sku)
);

CREATE TABLE IF NOT EXISTS shop_inventory (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
    warehouse_id TEXT NOT NULL REFERENCES shop_warehouses(id) ON DELETE CASCADE,
    quantity_on_hand DECIMAL(15, 2) DEFAULT 0,
    quantity_reserved DECIMAL(15, 2) DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, product_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS shop_loyalty_members (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    card_number TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'Silver',
    points_balance INTEGER DEFAULT 0,
    lifetime_points INTEGER DEFAULT 0,
    total_spend DECIMAL(15, 2) DEFAULT 0,
    visit_count INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Active',
    joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, card_number),
    UNIQUE(tenant_id, customer_id)
);

CREATE TABLE IF NOT EXISTS shop_sales (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES shop_branches(id),
    terminal_id TEXT REFERENCES shop_terminals(id),
    user_id TEXT REFERENCES users(id),
    customer_id TEXT REFERENCES contacts(id),
    loyalty_member_id TEXT REFERENCES shop_loyalty_members(id),
    sale_number TEXT NOT NULL,
    subtotal DECIMAL(15, 2) NOT NULL,
    tax_total DECIMAL(15, 2) NOT NULL,
    discount_total DECIMAL(15, 2) DEFAULT 0,
    grand_total DECIMAL(15, 2) NOT NULL,
    total_paid DECIMAL(15, 2) DEFAULT 0,
    change_due DECIMAL(15, 2) DEFAULT 0,
    payment_method TEXT NOT NULL, 
    payment_details JSONB, 
    status TEXT NOT NULL DEFAULT 'Completed',
    points_earned INTEGER DEFAULT 0,
    points_redeemed INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, sale_number)
);

CREATE TABLE IF NOT EXISTS shop_sale_items (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sale_id TEXT NOT NULL REFERENCES shop_sales(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES shop_products(id),
    quantity DECIMAL(15, 2) NOT NULL,
    unit_price DECIMAL(15, 2) NOT NULL,
    tax_amount DECIMAL(15, 2) DEFAULT 0,
    discount_amount DECIMAL(15, 2) DEFAULT 0,
    subtotal DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shop_inventory_movements (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES shop_products(id),
    warehouse_id TEXT NOT NULL REFERENCES shop_warehouses(id),
    type TEXT NOT NULL, 
    quantity DECIMAL(15, 2) NOT NULL, 
    reference_id TEXT, 
    reason TEXT,
    user_id TEXT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
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
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    deleted_at TIMESTAMP
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
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    version INTEGER DEFAULT 1,
    deleted_at TIMESTAMP
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

-- Fix-up: Drop erroneous FK constraints on audit columns (created_by, updated_by, approved_by)
-- These were never intended to reference the users table
ALTER TABLE payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_created_by_fkey;
ALTER TABLE payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_updated_by_fkey;
ALTER TABLE payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_approved_by_fkey;
ALTER TABLE payroll_employees DROP CONSTRAINT IF EXISTS payroll_employees_created_by_fkey;
ALTER TABLE payroll_employees DROP CONSTRAINT IF EXISTS payroll_employees_updated_by_fkey;

-- Fix-up for payroll_runs table: ensure columns added after initial table creation exist
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='period_start') THEN
        ALTER TABLE payroll_runs ADD COLUMN period_start DATE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='period_end') THEN
        ALTER TABLE payroll_runs ADD COLUMN period_end DATE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='employee_count') THEN
        ALTER TABLE payroll_runs ADD COLUMN employee_count INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='total_amount') THEN
        ALTER TABLE payroll_runs ADD COLUMN total_amount DECIMAL(15, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='approved_by') THEN
        ALTER TABLE payroll_runs ADD COLUMN approved_by TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='approved_at') THEN
        ALTER TABLE payroll_runs ADD COLUMN approved_at TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='paid_at') THEN
        ALTER TABLE payroll_runs ADD COLUMN paid_at TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='created_by') THEN
        ALTER TABLE payroll_runs ADD COLUMN created_by TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='updated_by') THEN
        ALTER TABLE payroll_runs ADD COLUMN updated_by TEXT;
    END IF;
END $$;

-- Fix-up for payroll_employees table
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_employees' AND column_name='department_id') THEN
        ALTER TABLE payroll_employees ADD COLUMN department_id TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_employees' AND column_name='employee_code') THEN
        ALTER TABLE payroll_employees ADD COLUMN employee_code TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_employees' AND column_name='photo') THEN
        ALTER TABLE payroll_employees ADD COLUMN photo TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_employees' AND column_name='adjustments') THEN
        ALTER TABLE payroll_employees ADD COLUMN adjustments JSONB DEFAULT '[]'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_employees' AND column_name='projects') THEN
        ALTER TABLE payroll_employees ADD COLUMN projects JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

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

-- Fix-up for marketplace_categories
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='marketplace_categories' AND column_name='icon') THEN
        ALTER TABLE marketplace_categories ADD COLUMN icon TEXT;
    END IF;
END $$;

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

CREATE TABLE IF NOT EXISTS quotations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    date DATE NOT NULL,
    items JSONB NOT NULL,
    total_amount DECIMAL(15, 2) NOT NULL,
    document_id TEXT,
    user_id TEXT REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 11b. RECURRING INVOICE TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS recurring_invoice_templates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id TEXT,
    contact_id TEXT NOT NULL,
    property_id TEXT NOT NULL,
    building_id TEXT,
    amount DECIMAL(15, 2) NOT NULL,
    description_template TEXT NOT NULL,
    day_of_month INTEGER NOT NULL,
    next_due_date TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    agreement_id TEXT,
    invoice_type TEXT DEFAULT 'Rental',
    frequency TEXT,
    auto_generate BOOLEAN NOT NULL DEFAULT FALSE,
    max_occurrences INTEGER,
    generated_count INTEGER NOT NULL DEFAULT 0,
    last_generated_date TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Fix: Drop overly-strict FK constraints on recurring_invoice_templates if they exist.
-- The client sends empty-string building_id when no building is selected, which violates FK.
-- SQLite never enforced these FKs so the app was designed without strict FK compliance.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'recurring_invoice_templates'::regclass
          AND contype = 'f'
          AND conname != 'recurring_invoice_templates_tenant_id_fkey'
    )
    LOOP
        EXECUTE format('ALTER TABLE recurring_invoice_templates DROP CONSTRAINT %I', r.conname);
    END LOOP;
EXCEPTION
    WHEN undefined_table THEN NULL; -- table doesn't exist yet, ignore
END $$;

-- Fix: Make building_id nullable (buildings aren't always selected)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'recurring_invoice_templates'
          AND column_name = 'building_id'
          AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE recurring_invoice_templates ALTER COLUMN building_id DROP NOT NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_recurring_templates_tenant ON recurring_invoice_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recurring_templates_contact ON recurring_invoice_templates(contact_id);
CREATE INDEX IF NOT EXISTS idx_recurring_templates_property ON recurring_invoice_templates(property_id);

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
        AND table_type = 'BASE TABLE'
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

-- ============================================================================
-- SCHEMA HARDENING: version, deleted_at columns for optimistic locking & soft deletes
-- ============================================================================

DO $$ 
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'accounts', 'contacts', 'vendors', 'categories', 'projects',
        'buildings', 'properties', 'units', 'transactions', 'invoices',
        'bills', 'budgets', 'quotations', 'contracts',
        'rental_agreements', 'project_agreements', 'sales_returns',
        'recurring_invoice_templates', 'documents',
        'purchase_orders', 'p2p_invoices', 'p2p_bills'
    ]
    LOOP
        -- Add version column if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl AND column_name = 'version'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN version INTEGER NOT NULL DEFAULT 1', tbl);
        END IF;

        -- Add deleted_at column if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl AND column_name = 'deleted_at'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN deleted_at TIMESTAMP', tbl);
        END IF;
    END LOOP;
END $$;

-- Sync Conflicts table: audit trail for all conflict resolutions
CREATE TABLE IF NOT EXISTS sync_conflicts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    local_version INTEGER,
    remote_version INTEGER,
    local_data JSONB,
    remote_data JSONB,
    resolution TEXT NOT NULL,
    resolved_by TEXT,
    device_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_tenant ON sync_conflicts(tenant_id, entity_type, created_at);

-- Idempotency Cache table: prevents duplicate sync push processing
CREATE TABLE IF NOT EXISTS idempotency_cache (
    idempotency_key TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    status_code INTEGER NOT NULL,
    response_body JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_cache_created ON idempotency_cache(created_at);

-- Auto-cleanup expired idempotency entries (>24h)
-- In production, run via pg_cron or application-level scheduler:
-- DELETE FROM idempotency_cache WHERE created_at < NOW() - INTERVAL '24 hours';
