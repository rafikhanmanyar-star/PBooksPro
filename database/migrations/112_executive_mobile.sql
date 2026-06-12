-- Executive Mobile Mode: unposted field transactions + per-user interface preference.

ALTER TABLE users ADD COLUMN IF NOT EXISTS interface_mode TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_interface_mode_check;
ALTER TABLE users ADD CONSTRAINT users_interface_mode_check
  CHECK (interface_mode IN ('auto', 'full_erp', 'executive_mobile'));

CREATE TABLE IF NOT EXISTS unposted_transactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'PKR',
  transaction_type TEXT NOT NULL,
  description TEXT,
  party_name TEXT,
  supplier_id TEXT,
  employee_id TEXT,
  customer_id TEXT,
  project_id TEXT,
  property_id TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'draft',
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  CONSTRAINT unposted_transactions_status_check
    CHECK (status IN ('draft', 'submitted', 'under_review', 'processed', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_unposted_transactions_tenant_status
  ON unposted_transactions (tenant_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_unposted_transactions_tenant_created_by
  ON unposted_transactions (tenant_id, created_by, created_at DESC)
  WHERE deleted_at IS NULL;
