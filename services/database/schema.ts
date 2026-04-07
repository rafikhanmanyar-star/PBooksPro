/**
 * SQL Database Schema for PBooksPro
 * 
 * This file defines the complete database schema that mirrors the AppState structure.
 * All tables are designed to maintain referential integrity and support the application's
 * data model.
 */

// Aligned with PostgreSQL (postgresql-schema.sql + hardening). PostgreSQL is source of truth.
// Bump when schema changes; keep electron/schemaVersion.json in sync (npm run electron:extract-schema).
export const SCHEMA_VERSION = 16;

export const CREATE_SCHEMA_SQL = `
-- PBooksPro Schema (PRAGMAs set in sqliteBridge.cjs)

-- Metadata table for schema version and app settings
CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Canonical schema version row for startup validation (single row id=1)
CREATE TABLE IF NOT EXISTS schema_meta (
    id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
    version INTEGER NOT NULL,
    last_updated TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tenants table (minimal stub for FK refs from registered_suppliers; aligned with PostgreSQL)
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Users table (aligned with PostgreSQL: tenant_id, email, is_active, login_status)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '',
    username TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    password TEXT,
    email TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    login_status INTEGER NOT NULL DEFAULT 0,
    force_password_change INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id, username)
);

-- Company settings (multi-company local-only mode)
CREATE TABLE IF NOT EXISTS company_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    company_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Accounts table (aligned with PostgreSQL)
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    balance REAL NOT NULL DEFAULT 0,
    description TEXT,
    is_permanent INTEGER NOT NULL DEFAULT 0,
    parent_account_id TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    FOREIGN KEY (parent_account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    contact_no TEXT,
    company_name TEXT,
    address TEXT,
    tenant_id TEXT NOT NULL DEFAULT '',
    user_id TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Vendors table
CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact_no TEXT,
    company_name TEXT,
    address TEXT,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    tenant_id TEXT NOT NULL DEFAULT '',
    user_id TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Categories table (aligned with PostgreSQL)
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    is_permanent INTEGER NOT NULL DEFAULT 0,
    is_rental INTEGER NOT NULL DEFAULT 0,
    is_hidden INTEGER NOT NULL DEFAULT 0,
    parent_category_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    FOREIGN KEY (parent_category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Projects table (aligned with PostgreSQL)
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    status TEXT,
    pm_config TEXT,
    installment_config TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT
);

-- Buildings table (aligned with PostgreSQL)
CREATE TABLE IF NOT EXISTS buildings (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT
);

-- Properties table (aligned with PostgreSQL)
CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    building_id TEXT NOT NULL,
    description TEXT,
    monthly_service_charge REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    FOREIGN KEY (owner_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE RESTRICT
);

-- Property ownership history (one active row per property: ownership_end_date IS NULL)
CREATE TABLE IF NOT EXISTS property_ownership_history (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '',
    property_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    ownership_start_date TEXT NOT NULL,
    ownership_end_date TEXT,
    transfer_reference TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES contacts(id) ON DELETE RESTRICT
);

-- Units table (aligned with PostgreSQL)
CREATE TABLE IF NOT EXISTS units (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    project_id TEXT NOT NULL,
    contact_id TEXT,
    sale_price REAL,
    description TEXT,
    type TEXT,
    area REAL,
    floor TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
);

-- Transactions table (aligned with PostgreSQL)
-- building_id without FK so sync can insert transactions before buildings are synced
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '',
    user_id TEXT,
    type TEXT NOT NULL,
    subtype TEXT,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    description TEXT,
    account_id TEXT NOT NULL,
    from_account_id TEXT,
    to_account_id TEXT,
    category_id TEXT,
    contact_id TEXT,
    vendor_id TEXT,
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
    project_asset_id TEXT,
    owner_id TEXT,
    is_system INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

-- Invoices table (aligned with PostgreSQL)
CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '',
    invoice_number TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    amount REAL NOT NULL,
    paid_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    invoice_type TEXT NOT NULL,
    description TEXT,
    project_id TEXT,
    building_id TEXT,
    property_id TEXT,
    unit_id TEXT,
    category_id TEXT,
    agreement_id TEXT,
    security_deposit_charge REAL,
    service_charges REAL,
    rental_month TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    UNIQUE(tenant_id, invoice_number)
);

-- Bills table (aligned with PostgreSQL)
CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '',
    bill_number TEXT NOT NULL,
    contact_id TEXT,
    vendor_id TEXT,
    amount REAL NOT NULL,
    paid_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    issue_date TEXT NOT NULL,
    due_date TEXT,
    description TEXT,
    category_id TEXT,
    project_id TEXT,
    building_id TEXT,
    property_id TEXT,
    project_agreement_id TEXT,
    contract_id TEXT,
    staff_id TEXT,
    bill_version INTEGER NOT NULL DEFAULT 1,
    expense_category_items TEXT,
    document_path TEXT,
    document_id TEXT,
    expense_bearer_type TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    UNIQUE(tenant_id, bill_number)
);

-- Budgets table
CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL,
    amount REAL NOT NULL,
    project_id TEXT,
    tenant_id TEXT NOT NULL DEFAULT '',
    user_id TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(category_id, project_id)
);

-- Quotations table (aligned with PostgreSQL)
CREATE TABLE IF NOT EXISTS quotations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '',
    vendor_id TEXT NOT NULL,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    items TEXT NOT NULL,
    total_amount REAL NOT NULL,
    document_id TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);

-- Plan Amenities table (configurable amenities for installment plans)
CREATE TABLE IF NOT EXISTS plan_amenities (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    is_percentage INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Installment Plans table (aligned with PostgreSQL: marketing/approval columns from 20260213)
CREATE TABLE IF NOT EXISTS installment_plans (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '',
    project_id TEXT NOT NULL,
    lead_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    net_value REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'Draft',
    duration_years INTEGER,
    down_payment_percentage REAL DEFAULT 0,
    frequency TEXT,
    list_price REAL DEFAULT 0,
    customer_discount REAL DEFAULT 0,
    floor_discount REAL DEFAULT 0,
    lump_sum_discount REAL DEFAULT 0,
    misc_discount REAL DEFAULT 0,
    down_payment_amount REAL DEFAULT 0,
    installment_amount REAL DEFAULT 0,
    total_installments INTEGER,
    description TEXT,
    user_id TEXT,
    intro_text TEXT,
    root_id TEXT,
    approval_requested_by TEXT,
    approval_requested_to TEXT,
    approval_requested_at TEXT,
    approval_reviewed_by TEXT,
    approval_reviewed_at TEXT,
    discounts TEXT,
    customer_discount_category_id TEXT,
    floor_discount_category_id TEXT,
    lump_sum_discount_category_id TEXT,
    misc_discount_category_id TEXT,
    selected_amenities TEXT,
    amenities_total REAL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (lead_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    file_data TEXT NOT NULL, -- Base64 encoded or blob URL
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT '',
    user_id TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    uploaded_by TEXT
);

-- Rental Agreements table (tenant_id for organization, same as other tables; contact_id = rental tenant)
CREATE TABLE IF NOT EXISTS rental_agreements (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '',
    agreement_number TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    property_id TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    monthly_rent REAL NOT NULL,
    rent_due_date INTEGER,
    status TEXT NOT NULL,
    description TEXT,
    security_deposit REAL,
    broker_id TEXT,
    broker_fee REAL,
    owner_id TEXT,
    previous_agreement_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE RESTRICT,
    UNIQUE(tenant_id, agreement_number)
);

-- Project Agreements table (aligned with PostgreSQL)
CREATE TABLE IF NOT EXISTS project_agreements (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '',
    agreement_number TEXT NOT NULL,
    client_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    unit_ids TEXT,
    list_price REAL,
    customer_discount REAL,
    floor_discount REAL,
    lump_sum_discount REAL,
    misc_discount REAL,
    selling_price REAL NOT NULL,
    rebate_amount REAL,
    rebate_broker_id TEXT,
    issue_date TEXT,
    description TEXT,
    status TEXT NOT NULL,
    cancellation_details TEXT,
    installment_plan TEXT,
    list_price_category_id TEXT,
    customer_discount_category_id TEXT,
    floor_discount_category_id TEXT,
    lump_sum_discount_category_id TEXT,
    misc_discount_category_id TEXT,
    selling_price_category_id TEXT,
    rebate_category_id TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    FOREIGN KEY (client_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
    UNIQUE(tenant_id, agreement_number)
);

-- Project Agreement Units junction table
CREATE TABLE IF NOT EXISTS project_agreement_units (
    agreement_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    PRIMARY KEY (agreement_id, unit_id),
    FOREIGN KEY (agreement_id) REFERENCES project_agreements(id) ON DELETE CASCADE,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
);

-- Sales Returns table (Project Sales Returns)
CREATE TABLE IF NOT EXISTS sales_returns (
    id TEXT PRIMARY KEY,
    return_number TEXT NOT NULL,
    agreement_id TEXT NOT NULL,
    return_date TEXT NOT NULL,
    reason TEXT NOT NULL,
    reason_notes TEXT,
    penalty_percentage REAL NOT NULL DEFAULT 0,
    penalty_amount REAL NOT NULL DEFAULT 0,
    refund_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    processed_date TEXT,
    refunded_date TEXT,
    refund_bill_id TEXT,
    created_by TEXT,
    notes TEXT,
    tenant_id TEXT NOT NULL DEFAULT '',
    user_id TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (agreement_id) REFERENCES project_agreements(id) ON DELETE RESTRICT,
    FOREIGN KEY (refund_bill_id) REFERENCES bills(id) ON DELETE SET NULL,
    UNIQUE(tenant_id, return_number)
);

CREATE INDEX IF NOT EXISTS idx_sales_returns_tenant_id ON sales_returns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_agreement_id ON sales_returns(agreement_id);

-- Project received assets (non-cash payments: plot, car, etc.) — long-term assets until sold
CREATE TABLE IF NOT EXISTS project_received_assets (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    invoice_id TEXT,
    description TEXT NOT NULL,
    asset_type TEXT NOT NULL,
    recorded_value REAL NOT NULL,
    received_date TEXT NOT NULL,
    sold_date TEXT,
    sale_amount REAL,
    sale_account_id TEXT,
    notes TEXT,
    tenant_id TEXT NOT NULL DEFAULT '',
    user_id TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
    FOREIGN KEY (sale_account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_project_received_assets_project ON project_received_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_project_received_assets_contact ON project_received_assets(contact_id);
CREATE INDEX IF NOT EXISTS idx_project_received_assets_invoice ON project_received_assets(invoice_id);

-- Contracts table (aligned with PostgreSQL)
CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '',
    contract_number TEXT NOT NULL,
    name TEXT NOT NULL,
    project_id TEXT NOT NULL,
    vendor_id TEXT NOT NULL,
    total_amount REAL NOT NULL,
    area REAL,
    rate REAL,
    start_date TEXT,
    end_date TEXT,
    status TEXT NOT NULL,
    category_ids TEXT,
    expense_category_items TEXT,
    terms_and_conditions TEXT,
    payment_terms TEXT,
    description TEXT,
    document_path TEXT,
    document_id TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT,
    UNIQUE(tenant_id, contract_number)
);

-- Contract Categories junction table
CREATE TABLE IF NOT EXISTS contract_categories (
    contract_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    PRIMARY KEY (contract_id, category_id),
    FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- Recurring Invoice Templates table
CREATE TABLE IF NOT EXISTS recurring_invoice_templates (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL,
    property_id TEXT NOT NULL,
    building_id TEXT NOT NULL,
    amount REAL NOT NULL,
    description_template TEXT NOT NULL,
    day_of_month INTEGER NOT NULL,
    next_due_date TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    agreement_id TEXT,
    invoice_type TEXT DEFAULT 'Rental',
    frequency TEXT,
    auto_generate INTEGER NOT NULL DEFAULT 0,
    max_occurrences INTEGER,
    generated_count INTEGER NOT NULL DEFAULT 0,
    last_generated_date TEXT,
    tenant_id TEXT NOT NULL DEFAULT '',
    user_id TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
);

-- PM Cycle Allocations table
CREATE TABLE IF NOT EXISTS pm_cycle_allocations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    cycle_id TEXT NOT NULL,
    cycle_label TEXT NOT NULL,
    frequency TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    allocation_date TEXT NOT NULL,
    amount REAL NOT NULL,
    paid_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'unpaid',
    bill_id TEXT,
    description TEXT,
    expense_total REAL NOT NULL DEFAULT 0,
    fee_rate REAL NOT NULL,
    excluded_category_ids TEXT, -- JSON string
    tenant_id TEXT NOT NULL DEFAULT '',
    user_id TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE SET NULL,
    UNIQUE(tenant_id, project_id, cycle_id)
);

-- Transaction Log table
CREATE TABLE IF NOT EXISTS transaction_log (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    description TEXT NOT NULL,
    user_id TEXT,
    user_label TEXT,
    data TEXT, -- JSON string
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Error Log table
CREATE TABLE IF NOT EXISTS error_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    stack TEXT,
    component_stack TEXT,
    timestamp TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- App Settings table (for various settings)
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL, -- JSON string for complex objects
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- License Settings table
CREATE TABLE IF NOT EXISTS license_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Chat Messages table (local only, not synced)
CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    recipient_name TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    read_at TEXT
);

-- Personal categories (income/expense for Personal transactions, separate from main categories)
CREATE TABLE IF NOT EXISTS personal_categories (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Income', 'Expense')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Personal transactions (links to main app accounts and personal_categories)
CREATE TABLE IF NOT EXISTS personal_transactions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '',
    account_id TEXT NOT NULL,
    personal_category_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Income', 'Expense')),
    amount REAL NOT NULL,
    transaction_date TEXT NOT NULL,
    description TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
    FOREIGN KEY (personal_category_id) REFERENCES personal_categories(id) ON DELETE RESTRICT
);

-- =====================================================
-- PERFORMANCE INDEXES (single-tenant, local-only)
-- =====================================================

-- Transactions
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_project_date ON transactions(project_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_invoice ON transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_transactions_bill ON transactions(bill_id);
CREATE INDEX IF NOT EXISTS idx_transactions_contact ON transactions(contact_id);
CREATE INDEX IF NOT EXISTS idx_transactions_building ON transactions(building_id);
CREATE INDEX IF NOT EXISTS idx_transactions_property ON transactions(property_id);
CREATE INDEX IF NOT EXISTS idx_transactions_unit ON transactions(unit_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant ON transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_owner ON transactions(owner_id);

-- Invoices
CREATE INDEX IF NOT EXISTS idx_invoices_contact ON invoices(contact_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_project_date ON invoices(project_id, issue_date);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON invoices(issue_date);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_due_status ON invoices(due_date, status);
CREATE INDEX IF NOT EXISTS idx_invoices_agreement ON invoices(agreement_id);
CREATE INDEX IF NOT EXISTS idx_invoices_property_type ON invoices(property_id, invoice_type);
CREATE INDEX IF NOT EXISTS idx_invoices_contact_type ON invoices(contact_id, invoice_type);
CREATE INDEX IF NOT EXISTS idx_invoices_building ON invoices(building_id);
CREATE INDEX IF NOT EXISTS idx_invoices_unit ON invoices(unit_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);

-- Bills
CREATE INDEX IF NOT EXISTS idx_bills_contact ON bills(contact_id);
CREATE INDEX IF NOT EXISTS idx_bills_vendor ON bills(vendor_id);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_project_date ON bills(project_id, issue_date);
CREATE INDEX IF NOT EXISTS idx_bills_issue_date ON bills(issue_date);
CREATE INDEX IF NOT EXISTS idx_bills_building ON bills(building_id);
CREATE INDEX IF NOT EXISTS idx_bills_property ON bills(property_id);
CREATE INDEX IF NOT EXISTS idx_bills_tenant ON bills(tenant_id);

-- Contacts
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);

-- Soft-delete filter indexes
CREATE INDEX IF NOT EXISTS idx_accounts_deleted ON accounts(deleted_at);
CREATE INDEX IF NOT EXISTS idx_contacts_deleted ON contacts(deleted_at);
CREATE INDEX IF NOT EXISTS idx_transactions_deleted ON transactions(deleted_at);
CREATE INDEX IF NOT EXISTS idx_invoices_deleted ON invoices(deleted_at);
CREATE INDEX IF NOT EXISTS idx_bills_deleted ON bills(deleted_at);

-- Quotations
CREATE INDEX IF NOT EXISTS idx_quotations_vendor ON quotations(vendor_id);
CREATE INDEX IF NOT EXISTS idx_quotations_date ON quotations(date);

-- Documents
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id);

-- PM Cycle Allocations
CREATE INDEX IF NOT EXISTS idx_pm_cycle_allocations_project_id ON pm_cycle_allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_pm_cycle_allocations_cycle_id ON pm_cycle_allocations(cycle_id);

-- Recurring Invoice Templates
CREATE INDEX IF NOT EXISTS idx_recurring_invoice_templates_agreement ON recurring_invoice_templates(agreement_id);
CREATE INDEX IF NOT EXISTS idx_recurring_invoice_templates_tenant ON recurring_invoice_templates(tenant_id);

-- Documents
CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id);

-- Contracts
CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON contracts(tenant_id);

-- Chat
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_recipient ON chat_messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);

-- Rental & Project Agreements
CREATE INDEX IF NOT EXISTS idx_rental_agreements_contact_id ON rental_agreements(contact_id);
CREATE INDEX IF NOT EXISTS idx_rental_agreements_property_id ON rental_agreements(property_id);
CREATE INDEX IF NOT EXISTS idx_rental_agreements_tenant ON rental_agreements(tenant_id);

-- Sales Returns
CREATE INDEX IF NOT EXISTS idx_sales_returns_agreement_id ON sales_returns(agreement_id);

-- Properties
CREATE INDEX IF NOT EXISTS idx_properties_building ON properties(building_id);
CREATE INDEX IF NOT EXISTS idx_properties_owner ON properties(owner_id);
CREATE INDEX IF NOT EXISTS idx_properties_tenant ON properties(tenant_id);

-- Property ownership history
CREATE INDEX IF NOT EXISTS idx_property_ownership_history_property ON property_ownership_history(property_id);
CREATE INDEX IF NOT EXISTS idx_property_ownership_history_owner ON property_ownership_history(owner_id);
CREATE INDEX IF NOT EXISTS idx_property_ownership_history_start ON property_ownership_history(ownership_start_date);
CREATE INDEX IF NOT EXISTS idx_property_ownership_history_property_end ON property_ownership_history(property_id, ownership_end_date);

-- Units
CREATE INDEX IF NOT EXISTS idx_units_project ON units(project_id);
CREATE INDEX IF NOT EXISTS idx_units_contact ON units(contact_id);
CREATE INDEX IF NOT EXISTS idx_units_tenant ON units(tenant_id);

-- Projects
CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);

-- Vendors
CREATE INDEX IF NOT EXISTS idx_vendors_tenant ON vendors(tenant_id);

-- Categories
CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories(tenant_id);

-- Buildings
CREATE INDEX IF NOT EXISTS idx_buildings_tenant ON buildings(tenant_id);

-- Accounts
CREATE INDEX IF NOT EXISTS idx_accounts_tenant ON accounts(tenant_id);

-- Personal categories & transactions
CREATE INDEX IF NOT EXISTS idx_personal_categories_tenant ON personal_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_personal_categories_type ON personal_categories(type);
CREATE INDEX IF NOT EXISTS idx_personal_transactions_tenant ON personal_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_personal_transactions_account ON personal_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_personal_transactions_date ON personal_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_personal_transactions_category ON personal_transactions(personal_category_id);

-- ============================================================================
-- P2P (PROCUREMENT-TO-PAY) SYSTEM - Purchase Orders only (p2p_invoices/bills/audit_trail removed)
-- ============================================================================

-- Purchase Orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
    id TEXT PRIMARY KEY,
    po_number TEXT NOT NULL,
    buyer_tenant_id TEXT NOT NULL,
    supplier_tenant_id TEXT NOT NULL,
    project_id TEXT,
    total_amount REAL NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('DRAFT', 'SENT', 'RECEIVED', 'INVOICED', 'DELIVERED', 'COMPLETED')) DEFAULT 'DRAFT',
    items TEXT NOT NULL, -- JSON array of POItem
    description TEXT,
    target_delivery_date TEXT,
    created_by TEXT,
    sent_at TEXT,
    received_at TEXT,
    delivered_at TEXT,
    completed_at TEXT,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id, po_number)
);

-- P2P Indexes (purchase_orders only)
CREATE INDEX IF NOT EXISTS idx_po_buyer_tenant ON purchase_orders(buyer_tenant_id);
CREATE INDEX IF NOT EXISTS idx_po_supplier_tenant ON purchase_orders(supplier_tenant_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_tenant_id ON purchase_orders(tenant_id);

-- Registered Suppliers table (Track approved supplier-buyer relationships)
CREATE TABLE IF NOT EXISTS registered_suppliers (
    id TEXT PRIMARY KEY,
    buyer_tenant_id TEXT NOT NULL,
    supplier_tenant_id TEXT NOT NULL,
    registration_request_id TEXT,
    registered_at TEXT NOT NULL DEFAULT (datetime('now')),
    registered_by TEXT,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED', 'REMOVED')) DEFAULT 'ACTIVE',
    notes TEXT,
    tenant_id TEXT NOT NULL,
    supplier_name TEXT,
    supplier_company TEXT,
    supplier_contact_no TEXT,
    supplier_address TEXT,
    supplier_description TEXT,
    FOREIGN KEY (buyer_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (supplier_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE(buyer_tenant_id, supplier_tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_registered_suppliers_buyer ON registered_suppliers(buyer_tenant_id);
CREATE INDEX IF NOT EXISTS idx_registered_suppliers_supplier ON registered_suppliers(supplier_tenant_id);
CREATE INDEX IF NOT EXISTS idx_registered_suppliers_status ON registered_suppliers(status);
CREATE INDEX IF NOT EXISTS idx_registered_suppliers_tenant_id ON registered_suppliers(tenant_id);






-- =====================================================
-- PAYROLL MODULE TABLES
-- =====================================================

-- Payroll Departments table
CREATE TABLE IF NOT EXISTS payroll_departments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT,
    description TEXT,
    parent_department_id TEXT,
    head_employee_id TEXT,
    cost_center_code TEXT,
    budget_allocation REAL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    updated_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (parent_department_id) REFERENCES payroll_departments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_departments_tenant ON payroll_departments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payroll_departments_parent ON payroll_departments(parent_department_id);
CREATE INDEX IF NOT EXISTS idx_payroll_departments_active ON payroll_departments(tenant_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_departments_name_unique ON payroll_departments(tenant_id, name);

-- Payroll Grade Levels table
CREATE TABLE IF NOT EXISTS payroll_grades (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    min_salary REAL NOT NULL DEFAULT 0,
    max_salary REAL NOT NULL DEFAULT 0,
    created_by TEXT,
    updated_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payroll_grades_tenant ON payroll_grades(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_grades_name_unique ON payroll_grades(tenant_id, name);

-- Payroll Employees table
CREATE TABLE IF NOT EXISTS payroll_employees (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    photo TEXT,
    employee_code TEXT,
    designation TEXT NOT NULL,
    department TEXT NOT NULL,
    department_id TEXT,
    grade TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RESIGNED', 'TERMINATED', 'ON_LEAVE')),
    joining_date TEXT NOT NULL,
    termination_date TEXT,
    salary TEXT NOT NULL DEFAULT '{"basic": 0, "allowances": [], "deductions": []}',
    adjustments TEXT DEFAULT '[]',
    projects TEXT DEFAULT '[]',
    created_by TEXT NOT NULL,
    updated_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (department_id) REFERENCES payroll_departments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_employees_tenant ON payroll_employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payroll_employees_status ON payroll_employees(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_payroll_employees_department ON payroll_employees(tenant_id, department);
CREATE INDEX IF NOT EXISTS idx_payroll_employees_department_id ON payroll_employees(department_id);
CREATE INDEX IF NOT EXISTS idx_payroll_employees_code ON payroll_employees(tenant_id, employee_code);

-- Payroll Runs table
CREATE TABLE IF NOT EXISTS payroll_runs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    month TEXT NOT NULL,
    year INTEGER NOT NULL,
    period_start TEXT,
    period_end TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PROCESSING', 'APPROVED', 'PAID', 'CANCELLED')),
    total_amount REAL DEFAULT 0,
    employee_count INTEGER DEFAULT 0,
    created_by TEXT,
    updated_by TEXT,
    approved_by TEXT,
    approved_at TEXT,
    paid_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_tenant ON payroll_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON payroll_runs(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON payroll_runs(tenant_id, year, month);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_runs_unique ON payroll_runs(tenant_id, month, year);

-- Payslips table
CREATE TABLE IF NOT EXISTS payslips (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    payroll_run_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    basic_pay REAL NOT NULL DEFAULT 0,
    total_allowances REAL NOT NULL DEFAULT 0,
    total_deductions REAL NOT NULL DEFAULT 0,
    total_adjustments REAL NOT NULL DEFAULT 0,
    gross_pay REAL NOT NULL DEFAULT 0,
    net_pay REAL NOT NULL DEFAULT 0,
    allowance_details TEXT DEFAULT '[]',
    deduction_details TEXT DEFAULT '[]',
    adjustment_details TEXT DEFAULT '[]',
    is_paid INTEGER DEFAULT 0,
    paid_at TEXT,
    transaction_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES payroll_employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payslips_tenant ON payslips(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payslips_run ON payslips(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payslips_employee ON payslips(employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payslips_unique ON payslips(payroll_run_id, employee_id);

-- Payroll Salary Components table
CREATE TABLE IF NOT EXISTS payroll_salary_components (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('ALLOWANCE', 'DEDUCTION')),
    is_percentage INTEGER DEFAULT 0,
    default_value REAL DEFAULT 0,
    is_taxable INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payroll_components_tenant ON payroll_salary_components(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_components_unique ON payroll_salary_components(tenant_id, name, type);

-- WhatsApp menu sessions
CREATE TABLE IF NOT EXISTS whatsapp_menu_sessions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '',
    phone_number TEXT NOT NULL,
    current_menu_path TEXT NOT NULL DEFAULT 'root',
    last_interaction_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id, phone_number)
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_menu_sessions_phone ON whatsapp_menu_sessions(phone_number);

-- =============================================================================
-- DOUBLE-ENTRY JOURNAL (immutable; legacy \`transactions\` table unchanged)
-- =============================================================================

CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '',
    entry_date TEXT NOT NULL,
    reference TEXT NOT NULL DEFAULT '',
    description TEXT,
    source_module TEXT,
    source_id TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS journal_lines (
    id TEXT PRIMARY KEY,
    journal_entry_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    debit_amount REAL NOT NULL DEFAULT 0,
    credit_amount REAL NOT NULL DEFAULT 0,
    line_number INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
    CHECK (debit_amount >= 0 AND credit_amount >= 0),
    CHECK (
        (debit_amount > 0 AND credit_amount = 0)
        OR (credit_amount > 0 AND debit_amount = 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant_date ON journal_entries(tenant_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_source ON journal_entries(source_module, source_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_id);

CREATE TABLE IF NOT EXISTS journal_reversals (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '',
    original_journal_entry_id TEXT NOT NULL,
    reversal_journal_entry_id TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by TEXT,
    FOREIGN KEY (original_journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT,
    FOREIGN KEY (reversal_journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT,
    UNIQUE(original_journal_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_journal_reversals_reversal ON journal_reversals(reversal_journal_entry_id);

CREATE TABLE IF NOT EXISTS accounting_audit_log (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '',
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    user_id TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    old_value TEXT,
    new_value TEXT
);

CREATE INDEX IF NOT EXISTS idx_accounting_audit_entity ON accounting_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_accounting_audit_ts ON accounting_audit_log(timestamp);

CREATE TRIGGER IF NOT EXISTS journal_entries_immutable_upd BEFORE UPDATE ON journal_entries
BEGIN SELECT RAISE(ABORT, 'journal_entries are immutable'); END;

CREATE TRIGGER IF NOT EXISTS journal_entries_immutable_del BEFORE DELETE ON journal_entries
BEGIN SELECT RAISE(ABORT, 'journal_entries cannot be deleted'); END;

CREATE TRIGGER IF NOT EXISTS journal_lines_immutable_upd BEFORE UPDATE ON journal_lines
BEGIN SELECT RAISE(ABORT, 'journal_lines are immutable'); END;

CREATE TRIGGER IF NOT EXISTS journal_lines_immutable_del BEFORE DELETE ON journal_lines
BEGIN SELECT RAISE(ABORT, 'journal_lines cannot be deleted'); END;
`;
