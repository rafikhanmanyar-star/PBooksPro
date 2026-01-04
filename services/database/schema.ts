/**
 * SQL Database Schema for PBooksPro
 * 
 * This file defines the complete database schema that mirrors the AppState structure.
 * All tables are designed to maintain referential integrity and support the application's
 * data model.
 */

export const SCHEMA_VERSION = 1;

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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Buildings table
CREATE TABLE IF NOT EXISTS buildings (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
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
    payslip_id TEXT,
    contract_id TEXT,
    agreement_id TEXT,
    batch_id TEXT,
    is_system INTEGER NOT NULL DEFAULT 0,
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
CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY,
    bill_number TEXT NOT NULL UNIQUE,
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (vendor_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
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
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    uploaded_by TEXT
);

-- Rental Agreements table
CREATE TABLE IF NOT EXISTS rental_agreements (
    id TEXT PRIMARY KEY,
    agreement_number TEXT NOT NULL UNIQUE,
    tenant_id TEXT NOT NULL,
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES contacts(id) ON DELETE RESTRICT,
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
);

-- Salary Components table
CREATE TABLE IF NOT EXISTS salary_components (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    is_taxable INTEGER NOT NULL DEFAULT 0,
    is_system INTEGER NOT NULL DEFAULT 0,
    calculation_type TEXT,
    formula TEXT,
    eligibility_rules TEXT, -- JSON string
    effective_from TEXT,
    effective_to TEXT,
    country_code TEXT,
    category TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Staff table (Legacy)
CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    designation TEXT NOT NULL,
    basic_salary REAL NOT NULL,
    joining_date TEXT NOT NULL,
    status TEXT NOT NULL,
    email TEXT,
    project_id TEXT,
    building_id TEXT,
    salary_structure TEXT NOT NULL, -- JSON string
    bank_details TEXT, -- JSON string
    history TEXT NOT NULL, -- JSON string
    advance_balance REAL NOT NULL DEFAULT 0,
    exit_details TEXT, -- JSON string
    staff_type TEXT NOT NULL, -- 'project' or 'rental'
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE SET NULL
);

-- Employees table (Enterprise Payroll)
CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL UNIQUE,
    personal_details TEXT NOT NULL, -- JSON string
    employment_details TEXT NOT NULL, -- JSON string
    status TEXT NOT NULL,
    basic_salary REAL NOT NULL,
    salary_structure TEXT NOT NULL, -- JSON string
    project_assignments TEXT NOT NULL, -- JSON string
    bank_details TEXT, -- JSON string
    documents TEXT NOT NULL, -- JSON string
    lifecycle_history TEXT NOT NULL, -- JSON string
    termination_details TEXT, -- JSON string
    advance_balance REAL NOT NULL DEFAULT 0,
    loan_balance REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by TEXT,
    updated_by TEXT
);

-- Payroll Cycles table
CREATE TABLE IF NOT EXISTS payroll_cycles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    month TEXT NOT NULL,
    frequency TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    pay_date TEXT NOT NULL,
    issue_date TEXT NOT NULL,
    status TEXT NOT NULL,
    payslip_ids TEXT NOT NULL, -- JSON array
    total_employees INTEGER NOT NULL DEFAULT 0,
    total_gross_salary REAL NOT NULL DEFAULT 0,
    total_deductions REAL NOT NULL DEFAULT 0,
    total_net_salary REAL NOT NULL DEFAULT 0,
    project_costs TEXT, -- JSON object
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by TEXT,
    approved_at TEXT,
    approved_by TEXT,
    locked_at TEXT,
    locked_by TEXT,
    notes TEXT
);

-- Payslips table (Enterprise)
CREATE TABLE IF NOT EXISTS payslips (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    payroll_cycle_id TEXT NOT NULL,
    month TEXT NOT NULL,
    issue_date TEXT NOT NULL,
    pay_period_start TEXT NOT NULL,
    pay_period_end TEXT NOT NULL,
    basic_salary REAL NOT NULL,
    allowances TEXT NOT NULL, -- JSON array
    total_allowances REAL NOT NULL DEFAULT 0,
    bonuses TEXT, -- JSON array
    total_bonuses REAL NOT NULL DEFAULT 0,
    overtime TEXT, -- JSON array
    total_overtime REAL NOT NULL DEFAULT 0,
    commissions TEXT, -- JSON array
    total_commissions REAL NOT NULL DEFAULT 0,
    deductions TEXT NOT NULL, -- JSON array
    total_deductions REAL NOT NULL DEFAULT 0,
    tax_deductions TEXT NOT NULL, -- JSON array
    total_tax REAL NOT NULL DEFAULT 0,
    statutory_deductions TEXT NOT NULL, -- JSON array
    total_statutory REAL NOT NULL DEFAULT 0,
    loan_deductions TEXT NOT NULL, -- JSON array
    total_loan_deductions REAL NOT NULL DEFAULT 0,
    gross_salary REAL NOT NULL,
    taxable_income REAL NOT NULL,
    net_salary REAL NOT NULL,
    cost_allocations TEXT NOT NULL, -- JSON array
    is_prorated INTEGER NOT NULL DEFAULT 0,
    proration_days INTEGER,
    proration_reason TEXT,
    status TEXT NOT NULL,
    paid_amount REAL NOT NULL DEFAULT 0,
    payment_date TEXT,
    transaction_id TEXT,
    payment_account_id TEXT,
    generated_at TEXT NOT NULL,
    generated_by TEXT,
    approved_at TEXT,
    approved_by TEXT,
    notes TEXT,
    snapshot TEXT, -- JSON string
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (payroll_cycle_id) REFERENCES payroll_cycles(id) ON DELETE CASCADE,
    FOREIGN KEY (payment_account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

-- Legacy Payslips table
CREATE TABLE IF NOT EXISTS legacy_payslips (
    id TEXT PRIMARY KEY,
    staff_id TEXT NOT NULL,
    month TEXT NOT NULL,
    issue_date TEXT NOT NULL,
    basic_salary REAL NOT NULL,
    allowances TEXT NOT NULL, -- JSON array
    total_allowances REAL NOT NULL DEFAULT 0,
    deductions TEXT NOT NULL, -- JSON array
    total_deductions REAL NOT NULL DEFAULT 0,
    bonuses TEXT, -- JSON array
    total_bonuses REAL NOT NULL DEFAULT 0,
    gross_salary REAL NOT NULL,
    net_salary REAL NOT NULL,
    status TEXT NOT NULL,
    paid_amount REAL NOT NULL DEFAULT 0,
    payment_date TEXT,
    transaction_id TEXT,
    project_id TEXT,
    building_id TEXT,
    generated_at TEXT NOT NULL,
    payslip_type TEXT NOT NULL, -- 'project' or 'rental'
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (staff_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE SET NULL
);

-- Bonus Records table
CREATE TABLE IF NOT EXISTS bonus_records (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    effective_date TEXT NOT NULL,
    payroll_month TEXT,
    is_recurring INTEGER NOT NULL DEFAULT 0,
    recurrence_pattern TEXT,
    eligibility_rule TEXT,
    approved_by TEXT,
    approved_at TEXT,
    status TEXT NOT NULL,
    project_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

-- Payroll Adjustments table
CREATE TABLE IF NOT EXISTS payroll_adjustments (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    effective_date TEXT NOT NULL,
    payroll_month TEXT,
    is_recurring INTEGER NOT NULL DEFAULT 0,
    recurrence_pattern TEXT,
    formula TEXT,
    reason TEXT NOT NULL,
    performed_by TEXT NOT NULL,
    performed_at TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- Loan/Advance Records table
CREATE TABLE IF NOT EXISTS loan_advance_records (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    issued_date TEXT NOT NULL,
    repayment_start_date TEXT NOT NULL,
    total_installments INTEGER,
    installment_amount REAL,
    repayment_frequency TEXT NOT NULL,
    outstanding_balance REAL NOT NULL,
    status TEXT NOT NULL,
    description TEXT,
    transaction_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- Attendance Records table
CREATE TABLE IF NOT EXISTS attendance_records (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    date TEXT NOT NULL,
    check_in TEXT,
    check_out TEXT,
    hours_worked REAL,
    status TEXT NOT NULL,
    leave_type TEXT,
    project_id TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    UNIQUE(employee_id, date)
);

-- Tax Configurations table
CREATE TABLE IF NOT EXISTS tax_configurations (
    id TEXT PRIMARY KEY,
    country_code TEXT NOT NULL,
    state_code TEXT,
    effective_from TEXT NOT NULL,
    effective_to TEXT,
    tax_slabs TEXT NOT NULL, -- JSON array
    exemptions TEXT NOT NULL, -- JSON array
    credits TEXT NOT NULL, -- JSON array
    metadata TEXT, -- JSON object
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Statutory Configurations table
CREATE TABLE IF NOT EXISTS statutory_configurations (
    id TEXT PRIMARY KEY,
    country_code TEXT NOT NULL,
    type TEXT NOT NULL,
    employee_contribution_rate REAL,
    employer_contribution_rate REAL,
    max_salary_limit REAL,
    effective_from TEXT NOT NULL,
    effective_to TEXT,
    rules TEXT, -- JSON object
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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

-- Tasks table (for TodoList component)
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'medium',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
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
CREATE INDEX IF NOT EXISTS idx_payslips_employee ON payslips(employee_id);
CREATE INDEX IF NOT EXISTS idx_payslips_month ON payslips(month);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance_records(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
`;
