-- Bills (vendor / rental expense bills + payments tracked via paid_amount / status)
-- Run after tenants/contacts; category FK optional (categories may be local-only).

CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  bill_number TEXT NOT NULL,
  contact_id TEXT,
  vendor_id TEXT,
  amount NUMERIC(18, 2) NOT NULL,
  paid_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
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
  expense_bearer_type TEXT,
  expense_category_items TEXT,
  document_path TEXT,
  document_id TEXT,
  user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  UNIQUE (tenant_id, bill_number)
);

CREATE INDEX IF NOT EXISTS idx_bills_tenant ON bills(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bills_tenant_updated ON bills(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_bills_property ON bills(tenant_id, property_id) WHERE deleted_at IS NULL;
