-- App ledger transactions (income/expense/etc.), including rental invoice payments via invoice_id → invoices.
-- Run after 001 (accounts), 008 (invoices). category_id is not FK (categories may be local-only).

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  user_id TEXT,
  type TEXT NOT NULL,
  subtype TEXT,
  amount NUMERIC(18, 2) NOT NULL,
  date DATE NOT NULL,
  description TEXT,
  reference TEXT,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  from_account_id TEXT,
  to_account_id TEXT,
  category_id TEXT,
  contact_id TEXT,
  vendor_id TEXT,
  project_id TEXT,
  building_id TEXT,
  property_id TEXT,
  unit_id TEXT,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  bill_id TEXT,
  payslip_id TEXT,
  contract_id TEXT,
  agreement_id TEXT,
  batch_id TEXT,
  project_asset_id TEXT,
  owner_id TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_transactions_tenant ON transactions(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_updated ON transactions(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_transactions_invoice ON transactions(tenant_id, invoice_id) WHERE deleted_at IS NULL AND invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(tenant_id, date) WHERE deleted_at IS NULL;
