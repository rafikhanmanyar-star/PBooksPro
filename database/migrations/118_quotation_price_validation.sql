-- Vendor quotation price validation & override audit trail

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS quotation_number TEXT,
  ADD COLUMN IF NOT EXISTS expiry_date DATE,
  ADD COLUMN IF NOT EXISTS enable_price_validation BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS validation_scope VARCHAR(20) NOT NULL DEFAULT 'CATEGORY',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE quotations
  DROP CONSTRAINT IF EXISTS quotations_validation_scope_check;

ALTER TABLE quotations
  ADD CONSTRAINT quotations_validation_scope_check
  CHECK (validation_scope IN ('CATEGORY', 'ITEM'));

CREATE INDEX IF NOT EXISTS idx_quotations_vendor_active
  ON quotations(tenant_id, vendor_id, date DESC)
  WHERE deleted_at IS NULL AND is_active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotations_tenant_number_active
  ON quotations(tenant_id, quotation_number)
  WHERE deleted_at IS NULL AND quotation_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS quotation_price_overrides (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quotation_id TEXT REFERENCES quotations(id) ON DELETE SET NULL,
  quotation_reference TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('contract', 'bill')),
  source_id TEXT NOT NULL,
  line_item_id TEXT,
  vendor_id TEXT NOT NULL,
  category_id TEXT,
  project_id TEXT,
  quotation_rate NUMERIC(18, 4),
  transaction_rate NUMERIC(18, 4) NOT NULL,
  variance_amount NUMERIC(18, 4),
  variance_percentage NUMERIC(10, 4),
  override_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  override_datetime TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qpo_tenant_datetime
  ON quotation_price_overrides(tenant_id, override_datetime DESC);

CREATE INDEX IF NOT EXISTS idx_qpo_tenant_vendor
  ON quotation_price_overrides(tenant_id, vendor_id, override_datetime DESC);

CREATE INDEX IF NOT EXISTS idx_qpo_tenant_project
  ON quotation_price_overrides(tenant_id, project_id, override_datetime DESC)
  WHERE project_id IS NOT NULL;

COMMENT ON TABLE quotation_price_overrides IS 'Audit trail when user proceeds despite quotation price variance.';
COMMENT ON COLUMN quotations.validation_scope IS 'CATEGORY = compare all purchases in category; ITEM = match category + unit.';
