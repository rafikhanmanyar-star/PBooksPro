/**
 * SQL Database Schema for PBooksPro
 * 
 * This file defines the complete database schema that mirrors the AppState structure.
 * All tables are designed to maintain referential integrity and support the application's
 * data model.
 */

export const SCHEMA_VERSION = 2;

export const CREATE_SCHEMA_SQL = `
-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Metadata table for schema version and app settings
CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    password TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    balance REAL NOT NULL DEFAULT 0,
    is_permanent INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    parent_account_id TEXT,
    tenant_id TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
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
    tenant_id TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    is_permanent INTEGER NOT NULL DEFAULT 0,
    is_rental INTEGER NOT NULL DEFAULT 0,
    parent_category_id TEXT,
    tenant_id TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (parent_category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    status TEXT,
    pm_config TEXT, -- JSON string
    installment_config TEXT, -- JSON string
    tenant_id TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Buildings table
CREATE TABLE IF NOT EXISTS buildings (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    tenant_id TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Properties table
CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    building_id TEXT NOT NULL,
    description TEXT,
    monthly_service_charge REAL,
    tenant_id TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (owner_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE RESTRICT
);

-- Units table
CREATE TABLE IF NOT EXISTS units (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    project_id TEXT NOT NULL,
    contact_id TEXT,
    sale_price REAL,
    description TEXT,
    type TEXT,
    area REAL,
    floor TEXT,
    tenant_id TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
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
    project_id TEXT,
    building_id TEXT,
    property_id TEXT,
    unit_id TEXT,
    invoice_id TEXT,
    bill_id TEXT,
    contract_id TEXT,
    agreement_id TEXT,
    batch_id TEXT,
    is_system INTEGER NOT NULL DEFAULT 0,
    tenant_id TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
    FOREIGN KEY (from_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
    FOREIGN KEY (to_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE SET NULL,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL
);

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT NOT NULL UNIQUE,
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
    tenant_id TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE SET NULL,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Bills table
-- Note: bill_number UNIQUE constraint is handled at application level with tenant_id
-- Using INSERT OR REPLACE in saveAll to handle duplicates gracefully
CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY,
    bill_number TEXT NOT NULL,
    contact_id TEXT NOT NULL,
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
    expense_category_items TEXT,
    tenant_id TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE SET NULL,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL,
    FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL,
    FOREIGN KEY (staff_id) REFERENCES contacts(id) ON DELETE SET NULL
);

-- Budgets table
CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL,
    amount REAL NOT NULL,
    project_id TEXT,
    tenant_id TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(category_id, project_id)
);

-- Quotations table
CREATE TABLE IF NOT EXISTS quotations (
    id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    items TEXT NOT NULL, -- JSON array of QuotationItem
    document_id TEXT,
    total_amount REAL NOT NULL,
    tenant_id TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (vendor_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
);

-- Plan Amenities table (configurable amenities for installment plans)
CREATE TABLE IF NOT EXISTS plan_amenities (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    name TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    is_percentage INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Installment Plans table
CREATE TABLE IF NOT EXISTS installment_plans (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    user_id TEXT,
    project_id TEXT NOT NULL,
    lead_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    duration_years INTEGER NOT NULL,
    down_payment_percentage REAL NOT NULL,
    frequency TEXT NOT NULL,
    list_price REAL NOT NULL,
    customer_discount REAL NOT NULL DEFAULT 0,
    floor_discount REAL NOT NULL DEFAULT 0,
    lump_sum_discount REAL NOT NULL DEFAULT 0,
    misc_discount REAL NOT NULL DEFAULT 0,
    net_value REAL NOT NULL,
    down_payment_amount REAL NOT NULL,
    installment_amount REAL NOT NULL,
    total_installments INTEGER NOT NULL,
    description TEXT,
    intro_text TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    root_id TEXT,
    status TEXT NOT NULL DEFAULT 'Draft',
    approval_requested_by TEXT,
    approval_requested_to TEXT,
    approval_requested_at TEXT,
    approval_reviewed_by TEXT,
    approval_reviewed_at TEXT,
    discounts TEXT DEFAULT '[]',
    -- Discount category mappings
    customer_discount_category_id TEXT,
    floor_discount_category_id TEXT,
    lump_sum_discount_category_id TEXT,
    misc_discount_category_id TEXT,
    -- Selected amenities (JSON string)
    selected_amenities TEXT DEFAULT '[]',
    amenities_total REAL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
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
    tenant_id TEXT,
    user_id TEXT,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    uploaded_by TEXT
);

-- Rental Agreements table
CREATE TABLE IF NOT EXISTS rental_agreements (
    id TEXT PRIMARY KEY,
    agreement_number TEXT NOT NULL UNIQUE,
    contact_id TEXT NOT NULL,
    property_id TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    monthly_rent REAL NOT NULL,
    rent_due_date INTEGER NOT NULL,
    status TEXT NOT NULL,
    description TEXT,
    security_deposit REAL,
    broker_id TEXT,
    broker_fee REAL,
    org_id TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE RESTRICT,
    FOREIGN KEY (broker_id) REFERENCES contacts(id) ON DELETE SET NULL
);

-- Project Agreements table
CREATE TABLE IF NOT EXISTS project_agreements (
    id TEXT PRIMARY KEY,
    agreement_number TEXT NOT NULL UNIQUE,
    client_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    list_price REAL NOT NULL,
    customer_discount REAL NOT NULL DEFAULT 0,
    floor_discount REAL NOT NULL DEFAULT 0,
    lump_sum_discount REAL NOT NULL DEFAULT 0,
    misc_discount REAL NOT NULL DEFAULT 0,
    selling_price REAL NOT NULL,
    rebate_amount REAL,
    rebate_broker_id TEXT,
    issue_date TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL,
    cancellation_details TEXT, -- JSON string
    list_price_category_id TEXT,
    customer_discount_category_id TEXT,
    floor_discount_category_id TEXT,
    lump_sum_discount_category_id TEXT,
    misc_discount_category_id TEXT,
    selling_price_category_id TEXT,
    rebate_category_id TEXT,
    tenant_id TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
    FOREIGN KEY (rebate_broker_id) REFERENCES contacts(id) ON DELETE SET NULL
);

-- Project Agreement Units junction table
CREATE TABLE IF NOT EXISTS project_agreement_units (
    agreement_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    PRIMARY KEY (agreement_id, unit_id),
    FOREIGN KEY (agreement_id) REFERENCES project_agreements(id) ON DELETE CASCADE,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
);

-- Contracts table
CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY,
    contract_number TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    project_id TEXT NOT NULL,
    vendor_id TEXT NOT NULL,
    total_amount REAL NOT NULL,
    area REAL,
    rate REAL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL,
    terms_and_conditions TEXT,
    payment_terms TEXT,
    expense_category_items TEXT,
    description TEXT,
    tenant_id TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
    FOREIGN KEY (vendor_id) REFERENCES contacts(id) ON DELETE RESTRICT
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
    frequency TEXT,
    auto_generate INTEGER NOT NULL DEFAULT 0,
    max_occurrences INTEGER,
    generated_count INTEGER NOT NULL DEFAULT 0,
    last_generated_date TEXT,
    tenant_id TEXT,
    user_id TEXT,
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
    tenant_id TEXT,
    user_id TEXT,
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

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL CHECK (type IN ('Personal', 'Assigned')),
    category TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Not Started', 'In Progress', 'Review', 'Completed')),
    start_date TEXT NOT NULL,
    hard_deadline TEXT NOT NULL,
    kpi_goal TEXT,
    kpi_target_value REAL,
    kpi_current_value REAL NOT NULL DEFAULT 0,
    kpi_unit TEXT,
    kpi_progress_percentage REAL NOT NULL DEFAULT 0 CHECK (kpi_progress_percentage >= 0 AND kpi_progress_percentage <= 100),
    assigned_by_id TEXT,
    assigned_to_id TEXT,
    created_by_id TEXT NOT NULL,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Task performance scores table (for leaderboard)
CREATE TABLE IF NOT EXISTS task_performance_scores (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    total_tasks INTEGER NOT NULL DEFAULT 0,
    completed_tasks INTEGER NOT NULL DEFAULT 0,
    on_time_completions INTEGER NOT NULL DEFAULT 0,
    overdue_tasks INTEGER NOT NULL DEFAULT 0,
    average_kpi_achievement REAL NOT NULL DEFAULT 0,
    completion_rate REAL NOT NULL DEFAULT 0 CHECK (completion_rate >= 0 AND completion_rate <= 100),
    deadline_adherence_rate REAL NOT NULL DEFAULT 0 CHECK (deadline_adherence_rate >= 0 AND deadline_adherence_rate <= 100),
    performance_score REAL NOT NULL DEFAULT 0,
    calculated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id, user_id, period_start, period_end)
);

-- Task performance configuration (Admin-configurable weights)
CREATE TABLE IF NOT EXISTS task_performance_config (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL UNIQUE,
    completion_rate_weight REAL NOT NULL DEFAULT 0.33 CHECK (completion_rate_weight >= 0 AND completion_rate_weight <= 1),
    deadline_adherence_weight REAL NOT NULL DEFAULT 0.33 CHECK (deadline_adherence_weight >= 0 AND deadline_adherence_weight <= 1),
    kpi_achievement_weight REAL NOT NULL DEFAULT 0.34 CHECK (kpi_achievement_weight >= 0 AND kpi_achievement_weight <= 1),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (ABS((completion_rate_weight + deadline_adherence_weight + kpi_achievement_weight) - 1.0) < 0.01)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_project_date ON transactions(project_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_invoice ON transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_transactions_bill ON transactions(bill_id);
CREATE INDEX IF NOT EXISTS idx_invoices_contact ON invoices(contact_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_project_date ON invoices(project_id, issue_date);
CREATE INDEX IF NOT EXISTS idx_bills_contact ON bills(contact_id);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_project_date ON bills(project_id, issue_date);
CREATE INDEX IF NOT EXISTS idx_quotations_vendor ON quotations(vendor_id);
CREATE INDEX IF NOT EXISTS idx_quotations_date ON quotations(date);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
CREATE INDEX IF NOT EXISTS idx_pm_cycle_allocations_project_id ON pm_cycle_allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_pm_cycle_allocations_cycle_id ON pm_cycle_allocations(cycle_id);
CREATE INDEX IF NOT EXISTS idx_pm_cycle_allocations_project_id ON pm_cycle_allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_pm_cycle_allocations_cycle_id ON pm_cycle_allocations(cycle_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_recipient ON chat_messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);

-- Indexes for tenant_id and user_id (multi-tenant support)
CREATE INDEX IF NOT EXISTS idx_accounts_tenant_id ON accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_id ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_tenant_id ON categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_tenant_id ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_buildings_tenant_id ON buildings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_buildings_user_id ON buildings(user_id);
CREATE INDEX IF NOT EXISTS idx_properties_tenant_id ON properties(tenant_id);
CREATE INDEX IF NOT EXISTS idx_properties_user_id ON properties(user_id);
CREATE INDEX IF NOT EXISTS idx_units_tenant_id ON units(tenant_id);
CREATE INDEX IF NOT EXISTS idx_units_user_id ON units(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_id ON transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_user ON transactions(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_bills_tenant_id ON bills(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bills_user_id ON bills(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_tenant_id ON budgets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_quotations_tenant_id ON quotations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotations_user_id ON quotations(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_rental_agreements_org_id ON rental_agreements(org_id);
CREATE INDEX IF NOT EXISTS idx_rental_agreements_contact_id ON rental_agreements(contact_id);
CREATE INDEX IF NOT EXISTS idx_rental_agreements_user_id ON rental_agreements(user_id);
CREATE INDEX IF NOT EXISTS idx_project_agreements_tenant_id ON project_agreements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_project_agreements_user_id ON project_agreements(user_id);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant_id ON contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contracts_user_id ON contracts(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_invoice_templates_tenant_id ON recurring_invoice_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recurring_invoice_templates_user_id ON recurring_invoice_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_id ON tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_id ON tasks(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by_id ON tasks(created_by_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_hard_deadline ON tasks(hard_deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
CREATE INDEX IF NOT EXISTS idx_task_updates_task_id ON task_updates(task_id);
CREATE INDEX IF NOT EXISTS idx_task_updates_tenant_id ON task_updates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_updates_user_id ON task_updates(user_id);
CREATE INDEX IF NOT EXISTS idx_task_performance_scores_tenant_id ON task_performance_scores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_performance_scores_user_id ON task_performance_scores(user_id);

-- ============================================================================
-- P2P (PROCUREMENT-TO-PAY) SYSTEM
-- ============================================================================

-- Purchase Orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
    id TEXT PRIMARY KEY,
    po_number TEXT NOT NULL UNIQUE,
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- P2P Invoices table
CREATE TABLE IF NOT EXISTS p2p_invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT NOT NULL UNIQUE,
    po_id TEXT NOT NULL,
    buyer_tenant_id TEXT NOT NULL,
    supplier_tenant_id TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')) DEFAULT 'PENDING',
    items TEXT NOT NULL, -- JSON array matching PO items
    reviewed_by TEXT,
    reviewed_at TEXT,
    rejected_reason TEXT,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT
);

-- P2P Bills table
CREATE TABLE IF NOT EXISTS p2p_bills (
    id TEXT PRIMARY KEY,
    bill_number TEXT NOT NULL UNIQUE,
    invoice_id TEXT NOT NULL,
    po_id TEXT NOT NULL,
    buyer_tenant_id TEXT NOT NULL,
    supplier_tenant_id TEXT NOT NULL,
    amount REAL NOT NULL,
    due_date TEXT NOT NULL,
    payment_status TEXT NOT NULL CHECK (payment_status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE')) DEFAULT 'UNPAID',
    paid_amount REAL NOT NULL DEFAULT 0,
    paid_at TEXT,
    payment_account_id TEXT,
    transaction_id TEXT,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (invoice_id) REFERENCES p2p_invoices(id) ON DELETE RESTRICT,
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    FOREIGN KEY (payment_account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

-- P2P Audit Trail table
CREATE TABLE IF NOT EXISTS p2p_audit_trail (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('PO', 'INVOICE', 'BILL')),
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL, -- 'STATUS_CHANGE', 'CREATED', 'APPROVED', 'REJECTED'
    from_status TEXT,
    to_status TEXT,
    performed_by TEXT,
    performed_at TEXT NOT NULL DEFAULT (datetime('now')),
    notes TEXT,
    tenant_id TEXT NOT NULL
);

-- P2P Indexes
CREATE INDEX IF NOT EXISTS idx_po_buyer_tenant ON purchase_orders(buyer_tenant_id);
CREATE INDEX IF NOT EXISTS idx_po_supplier_tenant ON purchase_orders(supplier_tenant_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_tenant_id ON purchase_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_p2p_invoices_po_id ON p2p_invoices(po_id);
CREATE INDEX IF NOT EXISTS idx_p2p_invoices_status ON p2p_invoices(status);
CREATE INDEX IF NOT EXISTS idx_p2p_invoices_buyer_tenant ON p2p_invoices(buyer_tenant_id);
CREATE INDEX IF NOT EXISTS idx_p2p_invoices_supplier_tenant ON p2p_invoices(supplier_tenant_id);
CREATE INDEX IF NOT EXISTS idx_p2p_invoices_tenant_id ON p2p_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_p2p_bills_invoice_id ON p2p_bills(invoice_id);
CREATE INDEX IF NOT EXISTS idx_p2p_bills_due_date ON p2p_bills(due_date);
CREATE INDEX IF NOT EXISTS idx_p2p_bills_payment_status ON p2p_bills(payment_status);
CREATE INDEX IF NOT EXISTS idx_p2p_bills_tenant_id ON p2p_bills(tenant_id);
CREATE INDEX IF NOT EXISTS idx_p2p_audit_trail_entity ON p2p_audit_trail(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_p2p_audit_trail_tenant_id ON p2p_audit_trail(tenant_id);

-- Supplier Registration Requests table
CREATE TABLE IF NOT EXISTS supplier_registration_requests (
    id TEXT PRIMARY KEY,
    supplier_tenant_id TEXT NOT NULL,
    buyer_tenant_id TEXT NOT NULL,
    buyer_organization_email TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')) DEFAULT 'PENDING',
    supplier_message TEXT,
    buyer_comments TEXT,
    requested_at TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at TEXT,
    reviewed_by TEXT,
    tenant_id TEXT NOT NULL,
    reg_supplier_name TEXT,
    reg_supplier_company TEXT,
    reg_supplier_contact_no TEXT,
    reg_supplier_address TEXT,
    reg_supplier_description TEXT,
    FOREIGN KEY (supplier_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (buyer_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_supplier_reg_req_supplier ON supplier_registration_requests(supplier_tenant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_reg_req_buyer ON supplier_registration_requests(buyer_tenant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_reg_req_status ON supplier_registration_requests(status);
CREATE INDEX IF NOT EXISTS idx_supplier_reg_req_tenant_id ON supplier_registration_requests(tenant_id);

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
    created_by TEXT NOT NULL,
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
`;
