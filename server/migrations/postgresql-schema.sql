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
    last_login TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE(tenant_id, username)
);

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
    tenant_id TEXT NOT NULL,
    agreement_number TEXT NOT NULL,
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
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    FOREIGN KEY (broker_id) REFERENCES contacts(id) ON DELETE SET NULL,
    FOREIGN KEY (owner_id) REFERENCES contacts(id) ON DELETE SET NULL,
    UNIQUE(tenant_id, agreement_number)
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
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (client_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (rebate_broker_id) REFERENCES contacts(id) ON DELETE SET NULL,
    UNIQUE(tenant_id, agreement_number)
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
CREATE INDEX IF NOT EXISTS idx_rental_agreements_tenant_id ON rental_agreements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_project_agreements_tenant_id ON project_agreements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant_id ON contracts(tenant_id);

-- Transaction Audit Log table
CREATE TABLE IF NOT EXISTS transaction_audit_log (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    transaction_id TEXT,
    user_id TEXT NOT NULL,
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

-- Transaction indexes
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

-- Function to get current tenant ID
CREATE OR REPLACE FUNCTION get_current_tenant_id() 
RETURNS TEXT AS $$
    SELECT current_setting('app.current_tenant_id', TRUE);
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
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

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

