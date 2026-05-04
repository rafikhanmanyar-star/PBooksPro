-- Contractor advances, contractor bills (construction), and FIFO-style adjustment lines.
-- Requires: tenants, contacts (002), accounts, journal_entries (001+).

CREATE TABLE IF NOT EXISTS contractor_advances (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  contractor_contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  advance_date DATE NOT NULL,
  original_amount NUMERIC(18, 2) NOT NULL,
  remaining_amount NUMERIC(18, 2) NOT NULL,
  cash_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  advance_asset_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  advance_journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE RESTRICT,
  project_id TEXT,
  description TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT contractor_advances_remaining_ok CHECK (
    remaining_amount >= 0 AND remaining_amount <= original_amount
  ),
  CONSTRAINT contractor_advances_original_positive CHECK (original_amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_contractor_advances_tenant_contact
  ON contractor_advances(tenant_id, contractor_contact_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contractor_advances_tenant_date
  ON contractor_advances(tenant_id, advance_date) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contractor_advances_tenant_remaining
  ON contractor_advances(tenant_id, remaining_amount)
  WHERE deleted_at IS NULL AND remaining_amount > 0;

CREATE TABLE IF NOT EXISTS contractor_bills (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  contractor_contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  bill_number TEXT,
  bill_date DATE NOT NULL,
  amount NUMERIC(18, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  description TEXT,
  project_id TEXT,
  construction_expense_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  residual_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  approval_journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE RESTRICT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT contractor_bills_amount_positive CHECK (amount > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contractor_bills_tenant_number_alive
  ON contractor_bills(tenant_id, bill_number)
  WHERE deleted_at IS NULL AND bill_number IS NOT NULL AND btrim(bill_number) <> '';

CREATE INDEX IF NOT EXISTS idx_contractor_bills_tenant_contact
  ON contractor_bills(tenant_id, contractor_contact_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contractor_bills_tenant_status
  ON contractor_bills(tenant_id, status) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS contractor_bill_adjustments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  contractor_bill_id TEXT NOT NULL REFERENCES contractor_bills(id) ON DELETE CASCADE,
  contractor_advance_id TEXT NOT NULL REFERENCES contractor_advances(id) ON DELETE RESTRICT,
  amount NUMERIC(18, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contractor_bill_adjustments_amount_positive CHECK (amount > 0),
  UNIQUE (contractor_bill_id, contractor_advance_id)
);

CREATE INDEX IF NOT EXISTS idx_contractor_adj_tenant_bill
  ON contractor_bill_adjustments(tenant_id, contractor_bill_id);

CREATE INDEX IF NOT EXISTS idx_contractor_adj_tenant_advance
  ON contractor_bill_adjustments(tenant_id, contractor_advance_id);

