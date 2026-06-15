-- Sprint 4 follow-up: approval lifecycle columns for bills, contracts, and payments

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'Approved',
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by TEXT;

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'Approved',
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by TEXT;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'Approved',
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by TEXT;

CREATE INDEX IF NOT EXISTS idx_bills_tenant_approval_status
  ON bills (tenant_id, approval_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_tenant_approval_status
  ON contracts (tenant_id, approval_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_tenant_approval_status
  ON transactions (tenant_id, approval_status)
  WHERE deleted_at IS NULL;
