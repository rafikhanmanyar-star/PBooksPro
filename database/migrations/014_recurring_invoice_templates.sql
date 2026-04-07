-- Recurring rental invoice templates (LAN / PostgreSQL). Aligns with electron/schema.sql recurring_invoice_templates.

CREATE TABLE IF NOT EXISTS recurring_invoice_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  user_id TEXT,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  amount NUMERIC(18, 2) NOT NULL,
  description_template TEXT NOT NULL,
  day_of_month INTEGER NOT NULL,
  next_due_date DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  agreement_id TEXT,
  invoice_type TEXT DEFAULT 'Rental',
  frequency TEXT,
  auto_generate BOOLEAN NOT NULL DEFAULT FALSE,
  max_occurrences INTEGER,
  generated_count INTEGER NOT NULL DEFAULT 0,
  last_generated_date DATE,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_invoice_templates_tenant ON recurring_invoice_templates(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_recurring_invoice_templates_tenant_updated ON recurring_invoice_templates(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_recurring_invoice_templates_agreement ON recurring_invoice_templates(agreement_id) WHERE deleted_at IS NULL;
