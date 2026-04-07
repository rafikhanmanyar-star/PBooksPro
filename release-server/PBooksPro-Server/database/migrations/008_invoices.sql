-- Invoices (rental + other types; invoice_type distinguishes usage)
-- Run after contacts/tenants exist. No FK to categories (categories may be local-only).

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  invoice_number TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  amount NUMERIC(18, 2) NOT NULL,
  paid_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  invoice_type TEXT NOT NULL,
  description TEXT,
  project_id TEXT,
  building_id TEXT,
  property_id TEXT,
  unit_id TEXT,
  category_id TEXT,
  agreement_id TEXT,
  security_deposit_charge NUMERIC(18, 2),
  service_charges NUMERIC(18, 2),
  rental_month TEXT,
  user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  UNIQUE (tenant_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_updated ON invoices(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_invoices_agreement ON invoices(tenant_id, agreement_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_type ON invoices(tenant_id, invoice_type) WHERE deleted_at IS NULL;
