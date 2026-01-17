-- PostgreSQL Database Schema for PBooksPro
-- Multi-tenant architecture with Row Level Security

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TENANTS & LICENSING
-- ============================================================================

-- Tenants/Clients table
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    company_name TEXT,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    address TEXT,
    subdomain TEXT UNIQUE,
    
    -- License Information
    license_type TEXT NOT NULL DEFAULT 'trial',
    license_status TEXT NOT NULL DEFAULT 'active',
    license_key TEXT UNIQUE,
    trial_start_date TIMESTAMP,
    license_start_date TIMESTAMP,
    license_expiry_date TIMESTAMP,
    last_renewal_date TIMESTAMP,
    next_renewal_date TIMESTAMP,
    
    -- Subscription limits
    max_users INTEGER DEFAULT 5,
    max_projects INTEGER DEFAULT 10,
    subscription_tier TEXT DEFAULT 'free',
    
    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    settings JSONB DEFAULT '{}'::jsonb,
    
    CONSTRAINT valid_license_type CHECK (license_type IN ('trial', 'monthly', 'yearly', 'perpetual')),
    CONSTRAINT valid_license_status CHECK (license_status IN ('active', 'expired', 'suspended', 'cancelled'))
);

-- License Keys table
CREATE TABLE IF NOT EXISTS license_keys (
    id TEXT PRIMARY KEY,
    license_key TEXT UNIQUE NOT NULL,
    tenant_id TEXT,
    license_type TEXT NOT NULL,
    device_id TEXT,
    
    issued_date TIMESTAMP NOT NULL DEFAULT NOW(),
    activated_date TIMESTAMP,
    expiry_date TIMESTAMP,
    
    status TEXT NOT NULL DEFAULT 'pending',
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    
    issued_by TEXT,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,
    CONSTRAINT valid_license_type CHECK (license_type IN ('monthly', 'yearly', 'perpetual')),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'active', 'expired', 'revoked'))
);

-- License History
CREATE TABLE IF NOT EXISTS license_history (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    license_key_id TEXT,
    action TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    from_type TEXT,
    to_type TEXT,
    payment_id TEXT,
    performed_by TEXT,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (license_key_id) REFERENCES license_keys(id) ON DELETE SET NULL
);

-- Admin Users table (separate from regular users)
CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_role CHECK (role IN ('super_admin', 'admin'))
);

-- ============================================================================
-- USERS & AUTHENTICATION
-- ============================================================================

-- Users table (tenant-specific)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    username TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    password TEXT,
    email TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    login_status BOOLEAN NOT NULL DEFAULT FALSE,
    last_login TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE(tenant_id, username)
);

-- Add login_status column if it doesn't exist (for existing databases)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'login_status'
    ) THEN
        ALTER TABLE users ADD COLUMN login_status BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;

-- Create indexes for login_status (for faster queries)
CREATE INDEX IF NOT EXISTS idx_users_login_status ON users(login_status);
CREATE INDEX IF NOT EXISTS idx_users_tenant_login_status ON users(tenant_id, login_status);

-- ============================================================================
-- FINANCIAL DATA (All with tenant_id)
-- ============================================================================

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    is_permanent BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT,
    parent_account_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    contact_no TEXT,
    company_name TEXT,
    address TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    is_permanent BOOLEAN NOT NULL DEFAULT FALSE,
    is_rental BOOLEAN NOT NULL DEFAULT FALSE,
    parent_category_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    type TEXT NOT NULL,
    subtype TEXT,
    amount DECIMAL(15, 2) NOT NULL,
    date DATE NOT NULL,
    description TEXT,
    account_id TEXT NOT NULL,
    from_account_id TEXT,
    to_account_id TEXT,
    category_id TEXT,
    contact_id TEXT,
    project_id TEXT,
    building_id TEXT,
    property_id TEXT,
    unit_id TEXT,
    invoice_id TEXT,
    bill_id TEXT,
    payslip_id TEXT,
    contract_id TEXT,
    agreement_id TEXT,
    batch_id TEXT,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
);

-- ============================================================================
-- PROJECTS & PROPERTIES
-- ============================================================================

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    status TEXT,
    pm_config JSONB,
    installment_config JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Buildings table
CREATE TABLE IF NOT EXISTS buildings (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Properties table
CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    building_id TEXT NOT NULL,
    description TEXT,
    monthly_service_charge DECIMAL(15, 2),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE RESTRICT
);

-- Units table
CREATE TABLE IF NOT EXISTS units (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    project_id TEXT NOT NULL,
    contact_id TEXT,
    sale_price DECIMAL(15, 2),
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
);

-- ============================================================================
-- INVOICES & BILLS
-- ============================================================================

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    paid_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    invoice_type TEXT NOT NULL,
    description TEXT,
    project_id TEXT,
    building_id TEXT,
    property_id TEXT,
    unit_id TEXT,
    category_id TEXT,
    agreement_id TEXT,
    security_deposit_charge DECIMAL(15, 2),
    service_charges DECIMAL(15, 2),
    rental_month TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    UNIQUE(tenant_id, invoice_number)
);

-- Bills table
CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    bill_number TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    paid_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Unpaid',
    issue_date DATE NOT NULL,
    due_date DATE,
    description TEXT,
    category_id TEXT,
    project_id TEXT,
    building_id TEXT,
    property_id TEXT,
    project_agreement_id TEXT,
    contract_id TEXT,
    staff_id TEXT,
    expense_category_items JSONB,
    document_path TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    UNIQUE(tenant_id, bill_number)
);

-- Budgets table
CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    project_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Rental Agreements table
CREATE TABLE IF NOT EXISTS rental_agreements (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    agreement_number TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    property_id TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    monthly_rent DECIMAL(15, 2) NOT NULL,
    rent_due_date INTEGER NOT NULL,
    status TEXT NOT NULL,
    description TEXT,
    security_deposit DECIMAL(15, 2),
    broker_id TEXT,
    broker_fee DECIMAL(15, 2),
    owner_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (org_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    FOREIGN KEY (broker_id) REFERENCES contacts(id) ON DELETE SET NULL,
    FOREIGN KEY (owner_id) REFERENCES contacts(id) ON DELETE SET NULL,
    UNIQUE(org_id, agreement_number)
);

-- Project Agreements table
CREATE TABLE IF NOT EXISTS project_agreements (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    agreement_number TEXT NOT NULL,
    client_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    unit_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    list_price DECIMAL(15, 2) NOT NULL,
    customer_discount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    floor_discount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    lump_sum_discount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    misc_discount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    selling_price DECIMAL(15, 2) NOT NULL,
    rebate_amount DECIMAL(15, 2),
    rebate_broker_id TEXT,
    issue_date DATE NOT NULL,
    description TEXT,
    status TEXT NOT NULL,
    cancellation_details JSONB,
    list_price_category_id TEXT,
    customer_discount_category_id TEXT,
    floor_discount_category_id TEXT,
    lump_sum_discount_category_id TEXT,
    misc_discount_category_id TEXT,
    selling_price_category_id TEXT,
    rebate_category_id TEXT,
    installment_plan JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (client_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (rebate_broker_id) REFERENCES contacts(id) ON DELETE SET NULL,
    UNIQUE(tenant_id, agreement_number)
);

-- Sales Returns table
CREATE TABLE IF NOT EXISTS sales_returns (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    return_number TEXT NOT NULL,
    agreement_id TEXT NOT NULL,
    return_date DATE NOT NULL,
    reason TEXT NOT NULL,
    reason_notes TEXT,
    penalty_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0,
    penalty_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    refund_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    processed_date TIMESTAMP,
    refunded_date TIMESTAMP,
    refund_bill_id TEXT,
    created_by TEXT,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (agreement_id) REFERENCES project_agreements(id) ON DELETE RESTRICT,
    FOREIGN KEY (refund_bill_id) REFERENCES bills(id) ON DELETE SET NULL,
    UNIQUE(tenant_id, return_number)
);

-- Contracts table
CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    contract_number TEXT NOT NULL,
    name TEXT NOT NULL,
    project_id TEXT NOT NULL,
    vendor_id TEXT NOT NULL,
    total_amount DECIMAL(15, 2) NOT NULL,
    area DECIMAL(15, 2),
    rate DECIMAL(15, 2),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL,
    category_ids JSONB DEFAULT '[]'::jsonb,
    expense_category_items JSONB,
    terms_and_conditions TEXT,
    payment_terms TEXT,
    description TEXT,
    document_path TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (vendor_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    UNIQUE(tenant_id, contract_number)
);

-- ============================================================================
-- ADDITIONAL ENTITIES (Previously Local-Only)
-- ============================================================================

-- Quotations table
CREATE TABLE IF NOT EXISTS quotations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    vendor_id TEXT NOT NULL,
    name TEXT NOT NULL,
    date DATE NOT NULL,
    items JSONB NOT NULL,
    document_id TEXT,
    total_amount DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (vendor_id) REFERENCES contacts(id) ON DELETE RESTRICT
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    file_data TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);


-- Recurring Invoice Templates table
CREATE TABLE IF NOT EXISTS recurring_invoice_templates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    contact_id TEXT NOT NULL,
    property_id TEXT NOT NULL,
    building_id TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    description_template TEXT NOT NULL,
    day_of_month INTEGER NOT NULL,
    next_due_date DATE NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    agreement_id TEXT,
    frequency TEXT,
    auto_generate BOOLEAN NOT NULL DEFAULT FALSE,
    max_occurrences INTEGER,
    generated_count INTEGER NOT NULL DEFAULT 0,
    last_generated_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
);

-- Salary Components table (tenant-specific templates)
CREATE TABLE IF NOT EXISTS salary_components (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    is_taxable BOOLEAN NOT NULL DEFAULT FALSE,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    calculation_type TEXT,
    formula TEXT,
    eligibility_rules JSONB,
    effective_from DATE,
    effective_to DATE,
    country_code TEXT,
    category TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Employees table
CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    employee_id TEXT NOT NULL,
    personal_details JSONB NOT NULL,
    employment_details JSONB NOT NULL,
    status TEXT NOT NULL,
    basic_salary DECIMAL(15, 2) NOT NULL,
    salary_structure JSONB NOT NULL,
    project_assignments JSONB NOT NULL,
    bank_details JSONB,
    documents JSONB NOT NULL,
    lifecycle_history JSONB NOT NULL,
    termination_details JSONB,
    advance_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    loan_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(tenant_id, employee_id)
);

-- Payroll Cycles table
CREATE TABLE IF NOT EXISTS payroll_cycles (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    name TEXT NOT NULL,
    month TEXT NOT NULL,
    frequency TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    pay_date DATE NOT NULL,
    issue_date DATE NOT NULL,
    status TEXT NOT NULL,
    payslip_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_employees INTEGER NOT NULL DEFAULT 0,
    total_gross_salary DECIMAL(15, 2) NOT NULL DEFAULT 0,
    total_deductions DECIMAL(15, 2) NOT NULL DEFAULT 0,
    total_net_salary DECIMAL(15, 2) NOT NULL DEFAULT 0,
    project_costs JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMP,
    approved_by TEXT,
    locked_at TIMESTAMP,
    locked_by TEXT,
    notes TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Payslips table
CREATE TABLE IF NOT EXISTS payslips (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    employee_id TEXT NOT NULL,
    payroll_cycle_id TEXT NOT NULL,
    month TEXT NOT NULL,
    issue_date DATE NOT NULL,
    pay_period_start DATE NOT NULL,
    pay_period_end DATE NOT NULL,
    basic_salary DECIMAL(15, 2) NOT NULL,
    allowances JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_allowances DECIMAL(15, 2) NOT NULL DEFAULT 0,
    bonuses JSONB DEFAULT '[]'::jsonb,
    total_bonuses DECIMAL(15, 2) NOT NULL DEFAULT 0,
    overtime JSONB DEFAULT '[]'::jsonb,
    total_overtime DECIMAL(15, 2) NOT NULL DEFAULT 0,
    commissions JSONB DEFAULT '[]'::jsonb,
    total_commissions DECIMAL(15, 2) NOT NULL DEFAULT 0,
    deductions JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_deductions DECIMAL(15, 2) NOT NULL DEFAULT 0,
    tax_deductions JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_tax DECIMAL(15, 2) NOT NULL DEFAULT 0,
    statutory_deductions JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_statutory DECIMAL(15, 2) NOT NULL DEFAULT 0,
    loan_deductions JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_loan_deductions DECIMAL(15, 2) NOT NULL DEFAULT 0,
    gross_salary DECIMAL(15, 2) NOT NULL,
    taxable_income DECIMAL(15, 2) NOT NULL,
    net_salary DECIMAL(15, 2) NOT NULL,
    cost_allocations JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_prorated BOOLEAN NOT NULL DEFAULT FALSE,
    proration_days INTEGER,
    proration_reason TEXT,
    status TEXT NOT NULL,
    paid_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    payment_date DATE,
    transaction_id TEXT,
    payment_account_id TEXT,
    generated_at TIMESTAMP NOT NULL,
    generated_by TEXT,
    approved_at TIMESTAMP,
    approved_by TEXT,
    notes TEXT,
    snapshot JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (payroll_cycle_id) REFERENCES payroll_cycles(id) ON DELETE CASCADE,
    FOREIGN KEY (payment_account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

-- Legacy Payslips table
CREATE TABLE IF NOT EXISTS legacy_payslips (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    staff_id TEXT NOT NULL,
    month TEXT NOT NULL,
    issue_date DATE NOT NULL,
    basic_salary DECIMAL(15, 2) NOT NULL,
    allowances JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_allowances DECIMAL(15, 2) NOT NULL DEFAULT 0,
    deductions JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_deductions DECIMAL(15, 2) NOT NULL DEFAULT 0,
    bonuses JSONB DEFAULT '[]'::jsonb,
    total_bonuses DECIMAL(15, 2) NOT NULL DEFAULT 0,
    gross_salary DECIMAL(15, 2) NOT NULL,
    net_salary DECIMAL(15, 2) NOT NULL,
    status TEXT NOT NULL,
    paid_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    payment_date DATE,
    transaction_id TEXT,
    project_id TEXT,
    building_id TEXT,
    generated_at TIMESTAMP NOT NULL,
    payslip_type TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (staff_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE SET NULL,
    CONSTRAINT valid_payslip_type CHECK (payslip_type IN ('project', 'rental'))
);

-- Bonus Records table
CREATE TABLE IF NOT EXISTS bonus_records (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    employee_id TEXT NOT NULL,
    type TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    description TEXT NOT NULL,
    effective_date DATE NOT NULL,
    payroll_month TEXT,
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
    recurrence_pattern TEXT,
    eligibility_rule TEXT,
    approved_by TEXT,
    approved_at TIMESTAMP,
    status TEXT NOT NULL,
    project_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

-- Payroll Adjustments table
CREATE TABLE IF NOT EXISTS payroll_adjustments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    employee_id TEXT NOT NULL,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    description TEXT NOT NULL,
    effective_date DATE NOT NULL,
    payroll_month TEXT,
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
    recurrence_pattern TEXT,
    formula TEXT,
    reason TEXT NOT NULL,
    performed_by TEXT NOT NULL,
    performed_at TIMESTAMP NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- Loan Advance Records table
CREATE TABLE IF NOT EXISTS loan_advance_records (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    employee_id TEXT NOT NULL,
    type TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    issued_date DATE NOT NULL,
    repayment_start_date DATE NOT NULL,
    total_installments INTEGER,
    installment_amount DECIMAL(15, 2),
    repayment_frequency TEXT NOT NULL,
    outstanding_balance DECIMAL(15, 2) NOT NULL,
    status TEXT NOT NULL,
    description TEXT,
    transaction_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    CONSTRAINT valid_loan_type CHECK (type IN ('loan', 'advance'))
);

-- Attendance Records table
CREATE TABLE IF NOT EXISTS attendance_records (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    employee_id TEXT NOT NULL,
    date DATE NOT NULL,
    check_in TIME,
    check_out TIME,
    hours_worked DECIMAL(5, 2),
    status TEXT NOT NULL,
    leave_type TEXT,
    project_id TEXT,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    UNIQUE(tenant_id, employee_id, date)
);

-- Tax Configurations table (tenant-specific)
CREATE TABLE IF NOT EXISTS tax_configurations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    country_code TEXT NOT NULL,
    state_code TEXT,
    effective_from DATE NOT NULL,
    effective_to DATE,
    tax_slabs JSONB NOT NULL,
    exemptions JSONB NOT NULL,
    credits JSONB NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Statutory Configurations table (tenant-specific)
CREATE TABLE IF NOT EXISTS statutory_configurations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    country_code TEXT NOT NULL,
    type TEXT NOT NULL,
    employee_contribution_rate DECIMAL(5, 2),
    employer_contribution_rate DECIMAL(5, 2),
    max_salary_limit DECIMAL(15, 2),
    effective_from DATE NOT NULL,
    effective_to DATE,
    rules JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Transaction Log table (audit log - already exists but ensure user_id is present)
-- Note: Already exists above, but ensuring it has proper structure

-- Error Log table (tenant-specific)
CREATE TABLE IF NOT EXISTS error_log (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT,
    user_id TEXT,
    message TEXT NOT NULL,
    stack TEXT,
    component_stack TEXT,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- App Settings table (tenant-specific key-value store)
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    value JSONB NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(tenant_id, key)
);

-- License Settings table (tenant-specific)
CREATE TABLE IF NOT EXISTS license_settings (
    key TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE(tenant_id, key)
);

-- Note: Chat Messages table remains local-only (not synced to cloud)

-- PM Cycle Allocations table (tracks PM fee allocations per cycle)
CREATE TABLE IF NOT EXISTS pm_cycle_allocations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    project_id TEXT NOT NULL,
    cycle_id TEXT NOT NULL,
    cycle_label TEXT NOT NULL,
    frequency TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    allocation_date DATE NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    paid_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'unpaid',
    bill_id TEXT,
    description TEXT,
    expense_total DECIMAL(15, 2) NOT NULL DEFAULT 0,
    fee_rate DECIMAL(5, 2) NOT NULL,
    excluded_category_ids JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE SET NULL,
    UNIQUE(tenant_id, project_id, cycle_id)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Tenant indexes
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_accounts_tenant_id ON accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_id ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_categories_tenant_id ON categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_id ON transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_tenant_id ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_buildings_tenant_id ON buildings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_properties_tenant_id ON properties(tenant_id);
CREATE INDEX IF NOT EXISTS idx_units_tenant_id ON units(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bills_tenant_id ON bills(tenant_id);
CREATE INDEX IF NOT EXISTS idx_budgets_tenant_id ON budgets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rental_agreements_org_id ON rental_agreements(org_id);
CREATE INDEX IF NOT EXISTS idx_rental_agreements_contact_id ON rental_agreements(contact_id);
CREATE INDEX IF NOT EXISTS idx_project_agreements_tenant_id ON project_agreements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_tenant_id ON sales_returns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_agreement_id ON sales_returns(agreement_id);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant_id ON contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotations_tenant_id ON quotations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotations_user_id ON quotations(user_id);
CREATE INDEX IF NOT EXISTS idx_quotations_vendor_id ON quotations(vendor_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_recurring_invoice_templates_tenant_id ON recurring_invoice_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_salary_components_tenant_id ON salary_components(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_tenant_id ON employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_employee_id ON employees(tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_cycles_tenant_id ON payroll_cycles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payroll_cycles_user_id ON payroll_cycles(user_id);
CREATE INDEX IF NOT EXISTS idx_payslips_tenant_id ON payslips(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payslips_user_id ON payslips(user_id);
CREATE INDEX IF NOT EXISTS idx_payslips_employee_id ON payslips(employee_id);
CREATE INDEX IF NOT EXISTS idx_payslips_payroll_cycle_id ON payslips(payroll_cycle_id);
CREATE INDEX IF NOT EXISTS idx_legacy_payslips_tenant_id ON legacy_payslips(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bonus_records_tenant_id ON bonus_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bonus_records_employee_id ON bonus_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_tenant_id ON payroll_adjustments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_employee_id ON payroll_adjustments(employee_id);
CREATE INDEX IF NOT EXISTS idx_loan_advance_records_tenant_id ON loan_advance_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_loan_advance_records_employee_id ON loan_advance_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_tenant_id ON attendance_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_employee_id ON attendance_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON attendance_records(date);
CREATE INDEX IF NOT EXISTS idx_tax_configurations_tenant_id ON tax_configurations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_statutory_configurations_tenant_id ON statutory_configurations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_error_log_tenant_id ON error_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_app_settings_tenant_id ON app_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_license_settings_tenant_id ON license_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pm_cycle_allocations_tenant_id ON pm_cycle_allocations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pm_cycle_allocations_project_id ON pm_cycle_allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_pm_cycle_allocations_cycle_id ON pm_cycle_allocations(cycle_id);
CREATE INDEX IF NOT EXISTS idx_pm_cycle_allocations_user_id ON pm_cycle_allocations(user_id);

-- Transaction Audit Log table
CREATE TABLE IF NOT EXISTS transaction_audit_log (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    transaction_id TEXT,
    user_id TEXT, -- Nullable to allow user deletion while preserving audit trail (user_name and user_role remain)
    user_name TEXT NOT NULL,
    user_role TEXT NOT NULL,
    action TEXT NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'VIEW'
    transaction_type TEXT,
    amount DECIMAL(15, 2),
    description TEXT,
    old_values JSONB,
    new_values JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- User Sessions table (to prevent duplicate logins)
CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    ip_address TEXT,
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Enforce ONE active session row per (user_id, tenant_id)
-- If older duplicates exist from previous versions, keep the newest and delete the rest.
-- This makes it safe to add a UNIQUE index for single-session enforcement.
-- Only run this cleanup if the table exists and has data
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_sessions') THEN
    DELETE FROM user_sessions a
    USING user_sessions b
    WHERE a.user_id = b.user_id
      AND a.tenant_id = b.tenant_id
      AND (
        a.created_at < b.created_at
        OR (a.created_at = b.created_at AND a.id < b.id)
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_sessions_user_tenant ON user_sessions(user_id, tenant_id);

-- Transaction indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_project_id ON transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);

-- Audit log indexes
CREATE INDEX IF NOT EXISTS idx_transaction_audit_log_tenant_id ON transaction_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transaction_audit_log_user_id ON transaction_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_transaction_audit_log_transaction_id ON transaction_audit_log(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_audit_log_created_at ON transaction_audit_log(created_at);

-- Session indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_tenant_id ON user_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- License indexes
CREATE INDEX IF NOT EXISTS idx_license_keys_tenant_id ON license_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_license_keys_status ON license_keys(status);
CREATE INDEX IF NOT EXISTS idx_license_history_tenant_id ON license_history(tenant_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tenant tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_invoice_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_advance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE statutory_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_cycle_allocations ENABLE ROW LEVEL SECURITY;

-- Function to get current tenant ID
CREATE OR REPLACE FUNCTION get_current_tenant_id() 
RETURNS TEXT AS $$
    SELECT current_setting('app.current_tenant_id', TRUE);
$$ LANGUAGE sql STABLE;

-- Function to get current user ID
CREATE OR REPLACE FUNCTION get_current_user_id() 
RETURNS TEXT AS $$
    SELECT current_setting('app.current_user_id', TRUE);
$$ LANGUAGE sql STABLE;

-- RLS Policies
-- Drop existing policies if they exist, then create them
DROP POLICY IF EXISTS tenant_isolation_users ON users;
CREATE POLICY tenant_isolation_users ON users
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_accounts ON accounts;
CREATE POLICY tenant_isolation_accounts ON accounts
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_contacts ON contacts;
CREATE POLICY tenant_isolation_contacts ON contacts
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_categories ON categories;
CREATE POLICY tenant_isolation_categories ON categories
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_transactions ON transactions;
CREATE POLICY tenant_isolation_transactions ON transactions
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_projects ON projects;
CREATE POLICY tenant_isolation_projects ON projects
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_buildings ON buildings;
CREATE POLICY tenant_isolation_buildings ON buildings
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_properties ON properties;
CREATE POLICY tenant_isolation_properties ON properties
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_units ON units;
CREATE POLICY tenant_isolation_units ON units
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_invoices ON invoices;
CREATE POLICY tenant_isolation_invoices ON invoices
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_bills ON bills;
CREATE POLICY tenant_isolation_bills ON bills
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_budgets ON budgets;
CREATE POLICY tenant_isolation_budgets ON budgets
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_rental_agreements ON rental_agreements;
CREATE POLICY tenant_isolation_rental_agreements ON rental_agreements
    FOR ALL
    USING (org_id = get_current_tenant_id())
    WITH CHECK (org_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_project_agreements ON project_agreements;
CREATE POLICY tenant_isolation_project_agreements ON project_agreements
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_contracts ON contracts;
CREATE POLICY tenant_isolation_contracts ON contracts
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_quotations ON quotations;
CREATE POLICY tenant_isolation_quotations ON quotations
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_documents ON documents;
CREATE POLICY tenant_isolation_documents ON documents
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());


DROP POLICY IF EXISTS tenant_isolation_recurring_invoice_templates ON recurring_invoice_templates;
CREATE POLICY tenant_isolation_recurring_invoice_templates ON recurring_invoice_templates
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_salary_components ON salary_components;
CREATE POLICY tenant_isolation_salary_components ON salary_components
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_employees ON employees;
CREATE POLICY tenant_isolation_employees ON employees
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_payroll_cycles ON payroll_cycles;
CREATE POLICY tenant_isolation_payroll_cycles ON payroll_cycles
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_payslips ON payslips;
CREATE POLICY tenant_isolation_payslips ON payslips
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_legacy_payslips ON legacy_payslips;
CREATE POLICY tenant_isolation_legacy_payslips ON legacy_payslips
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_bonus_records ON bonus_records;
CREATE POLICY tenant_isolation_bonus_records ON bonus_records
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_payroll_adjustments ON payroll_adjustments;
CREATE POLICY tenant_isolation_payroll_adjustments ON payroll_adjustments
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_loan_advance_records ON loan_advance_records;
CREATE POLICY tenant_isolation_loan_advance_records ON loan_advance_records
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_attendance_records ON attendance_records;
CREATE POLICY tenant_isolation_attendance_records ON attendance_records
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_tax_configurations ON tax_configurations;
CREATE POLICY tenant_isolation_tax_configurations ON tax_configurations
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_statutory_configurations ON statutory_configurations;
CREATE POLICY tenant_isolation_statutory_configurations ON statutory_configurations
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_error_log ON error_log;
CREATE POLICY tenant_isolation_error_log ON error_log
    FOR ALL
    USING (tenant_id = get_current_tenant_id() OR tenant_id IS NULL)
    WITH CHECK (tenant_id = get_current_tenant_id() OR tenant_id IS NULL);

DROP POLICY IF EXISTS tenant_isolation_app_settings ON app_settings;
CREATE POLICY tenant_isolation_app_settings ON app_settings
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_license_settings ON license_settings;
CREATE POLICY tenant_isolation_license_settings ON license_settings
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_pm_cycle_allocations ON pm_cycle_allocations;
CREATE POLICY tenant_isolation_pm_cycle_allocations ON pm_cycle_allocations
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- ============================================================================
-- TASK MANAGEMENT
-- ============================================================================

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL CHECK (type IN ('Personal', 'Assigned')),
    category TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Not Started', 'In Progress', 'Review', 'Completed')),
    start_date DATE NOT NULL,
    hard_deadline DATE NOT NULL,
    kpi_goal TEXT,
    kpi_target_value REAL,
    kpi_current_value REAL DEFAULT 0,
    kpi_unit TEXT,
    kpi_progress_percentage REAL DEFAULT 0 CHECK (kpi_progress_percentage >= 0 AND kpi_progress_percentage <= 100),
    assigned_by_id TEXT,
    assigned_to_id TEXT,
    created_by_id TEXT NOT NULL,
    user_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT valid_deadline CHECK (hard_deadline >= start_date)
);

-- Task updates/comment history table
CREATE TABLE IF NOT EXISTS task_updates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    update_type TEXT NOT NULL CHECK (update_type IN ('Status Change', 'KPI Update', 'Comment', 'Check-in')),
    status_before TEXT,
    status_after TEXT,
    kpi_value_before REAL,
    kpi_value_after REAL,
    comment TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- Task performance scores table (for leaderboard)
CREATE TABLE IF NOT EXISTS task_performance_scores (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_tasks INTEGER DEFAULT 0,
    completed_tasks INTEGER DEFAULT 0,
    on_time_completions INTEGER DEFAULT 0,
    overdue_tasks INTEGER DEFAULT 0,
    average_kpi_achievement REAL DEFAULT 0,
    completion_rate REAL DEFAULT 0 CHECK (completion_rate >= 0 AND completion_rate <= 100),
    deadline_adherence_rate REAL DEFAULT 0 CHECK (deadline_adherence_rate >= 0 AND deadline_adherence_rate <= 100),
    performance_score REAL DEFAULT 0,
    calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(tenant_id, user_id, period_start, period_end)
);

-- Task performance configuration (Admin-configurable weights)
CREATE TABLE IF NOT EXISTS task_performance_config (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL UNIQUE,
    completion_rate_weight REAL DEFAULT 0.33 CHECK (completion_rate_weight >= 0 AND completion_rate_weight <= 1),
    deadline_adherence_weight REAL DEFAULT 0.33 CHECK (deadline_adherence_weight >= 0 AND deadline_adherence_weight <= 1),
    kpi_achievement_weight REAL DEFAULT 0.34 CHECK (kpi_achievement_weight >= 0 AND kpi_achievement_weight <= 1),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT weights_sum_to_one CHECK (
        ABS((completion_rate_weight + deadline_adherence_weight + kpi_achievement_weight) - 1.0) < 0.01
    )
);

-- Indexes for tasks
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_id ON tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_id ON tasks(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by_id ON tasks(created_by_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_hard_deadline ON tasks(hard_deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_status ON tasks(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_deadline ON tasks(tenant_id, hard_deadline);

CREATE INDEX IF NOT EXISTS idx_task_updates_task_id ON task_updates(task_id);
CREATE INDEX IF NOT EXISTS idx_task_updates_tenant_id ON task_updates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_updates_user_id ON task_updates(user_id);
CREATE INDEX IF NOT EXISTS idx_task_updates_created_at ON task_updates(created_at);

CREATE INDEX IF NOT EXISTS idx_task_performance_scores_tenant_id ON task_performance_scores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_performance_scores_user_id ON task_performance_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_task_performance_scores_period ON task_performance_scores(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_task_performance_scores_tenant_period ON task_performance_scores(tenant_id, period_start, period_end);

-- Row Level Security for tasks
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_performance_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_performance_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_tasks ON tasks;
CREATE POLICY tenant_isolation_tasks ON tasks
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_task_updates ON task_updates;
CREATE POLICY tenant_isolation_task_updates ON task_updates
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_task_performance_scores ON task_performance_scores;
CREATE POLICY tenant_isolation_task_performance_scores ON task_performance_scores
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_task_performance_config ON task_performance_config;
CREATE POLICY tenant_isolation_task_performance_config ON task_performance_config
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

