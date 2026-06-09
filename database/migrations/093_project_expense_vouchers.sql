-- Project Expense Voucher (PEV) module: categories with GL mapping and voucher workflow.
-- Requires: tenants, accounts (001), projects (005), vendors (006), journal_entries (001+).

CREATE TABLE IF NOT EXISTS project_expense_categories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  gl_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_expense_categories_name_nonempty CHECK (btrim(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pe_cat_tenant_name_alive
  ON project_expense_categories(tenant_id, lower(name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pe_cat_tenant_active
  ON project_expense_categories(tenant_id, is_active) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS project_expense_vouchers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  voucher_number TEXT NOT NULL,
  voucher_date DATE NOT NULL,
  project_id TEXT NOT NULL,
  expense_category_id TEXT NOT NULL REFERENCES project_expense_categories(id) ON DELETE RESTRICT,
  vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  payment_source_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  amount NUMERIC(18, 2) NOT NULL,
  description TEXT,
  document_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'submitted', 'approved', 'rejected', 'posted')
  ),
  journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE RESTRICT,
  submitted_at TIMESTAMPTZ,
  submitted_by TEXT,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  rejected_at TIMESTAMPTZ,
  rejected_by TEXT,
  rejection_reason TEXT,
  posted_at TIMESTAMPTZ,
  posted_by TEXT,
  created_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_expense_vouchers_amount_positive CHECK (amount > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pev_tenant_number_alive
  ON project_expense_vouchers(tenant_id, voucher_number)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pev_tenant_project
  ON project_expense_vouchers(tenant_id, project_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pev_tenant_status
  ON project_expense_vouchers(tenant_id, status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pev_tenant_category
  ON project_expense_vouchers(tenant_id, expense_category_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pev_tenant_vendor
  ON project_expense_vouchers(tenant_id, vendor_id) WHERE deleted_at IS NULL AND vendor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pev_tenant_date
  ON project_expense_vouchers(tenant_id, voucher_date) WHERE deleted_at IS NULL;
