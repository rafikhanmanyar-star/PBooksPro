-- Project construction contracts (vendor agreements) — LAN / PostgreSQL
-- Aligns with SQLite contracts in electron/schema.sql

CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  contract_number TEXT NOT NULL,
  name TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  total_amount NUMERIC(18, 2) NOT NULL,
  area NUMERIC(18, 4),
  rate NUMERIC(18, 4),
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL,
  category_ids TEXT,
  expense_category_items TEXT,
  terms_and_conditions TEXT,
  payment_terms TEXT,
  description TEXT,
  document_path TEXT,
  document_id TEXT,
  user_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_tenant_number_active
  ON contracts(tenant_id, contract_number)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON contracts(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contracts_tenant_updated ON contracts(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_contracts_project ON contracts(tenant_id, project_id) WHERE deleted_at IS NULL;
