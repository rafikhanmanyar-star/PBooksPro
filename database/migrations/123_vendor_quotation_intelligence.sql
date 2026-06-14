-- Vendor Quotation Intelligence: extended header fields, normalized items, price history, attachments, ratings

-- Extend quotations header (maps to vendor_quotations spec; table name kept for backward compatibility)
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'PKR',
  ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS building_id TEXT REFERENCES buildings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS package_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS quotation_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Draft',
  ADD COLUMN IF NOT EXISTS is_approved_rate BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payment_terms TEXT,
  ADD COLUMN IF NOT EXISTS delivery_period VARCHAR(100),
  ADD COLUMN IF NOT EXISTS warranty_period VARCHAR(100),
  ADD COLUMN IF NOT EXISTS retention_percent NUMERIC(18, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_percent NUMERIC(18, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remarks TEXT;

ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_status_check;
ALTER TABLE quotations
  ADD CONSTRAINT quotations_status_check
  CHECK (status IN ('Draft', 'Active', 'Approved', 'Expired', 'Superseded'));

ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_type_check;
ALTER TABLE quotations
  ADD CONSTRAINT quotations_type_check
  CHECK (quotation_type IS NULL OR quotation_type IN (
    'Material Supply', 'Labour Only', 'Material + Labour', 'Equipment Rental', 'Subcontractor'
  ));

-- Backfill status from is_active for existing rows
UPDATE quotations
SET status = CASE WHEN is_active = TRUE THEN 'Active' ELSE 'Draft' END
WHERE status IS NULL OR status = 'Draft';

CREATE INDEX IF NOT EXISTS idx_quotations_project
  ON quotations(tenant_id, project_id, date DESC)
  WHERE deleted_at IS NULL AND project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_status
  ON quotations(tenant_id, status, date DESC)
  WHERE deleted_at IS NULL;

-- Normalized quotation line items (vendor_quotation_items spec)
CREATE TABLE IF NOT EXISTS quotation_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  item_id TEXT,
  item_name VARCHAR(255),
  brand VARCHAR(255),
  specification TEXT,
  unit VARCHAR(50),
  quantity NUMERIC(18, 3) NOT NULL DEFAULT 0,
  unit_rate NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  market_rate NUMERIC(18, 2),
  previous_rate NUMERIC(18, 2),
  variance_percent NUMERIC(18, 2),
  approval_threshold_percent NUMERIC(18, 2) DEFAULT 5,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation
  ON quotation_items(quotation_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_quotation_items_category
  ON quotation_items(tenant_id, category_id)
  WHERE category_id IS NOT NULL;

-- Vendor price history for procurement intelligence
CREATE TABLE IF NOT EXISTS vendor_price_history (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  item_id TEXT,
  item_name VARCHAR(255),
  quotation_id TEXT REFERENCES quotations(id) ON DELETE SET NULL,
  quoted_rate NUMERIC(18, 2) NOT NULL,
  quotation_date DATE NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  building_id TEXT REFERENCES buildings(id) ON DELETE SET NULL,
  is_approved_rate BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vph_tenant_vendor_date
  ON vendor_price_history(tenant_id, vendor_id, quotation_date DESC);

CREATE INDEX IF NOT EXISTS idx_vph_tenant_category
  ON vendor_price_history(tenant_id, category_id, quotation_date DESC)
  WHERE category_id IS NOT NULL;

-- Multiple attachments per quotation
CREATE TABLE IF NOT EXISTS quotation_attachments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT,
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  document_type VARCHAR(100) NOT NULL DEFAULT 'Quotation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE quotation_attachments DROP CONSTRAINT IF EXISTS quotation_attachments_type_check;
ALTER TABLE quotation_attachments
  ADD CONSTRAINT quotation_attachments_type_check
  CHECK (document_type IN ('Quotation', 'Technical Proposal', 'BOQ', 'Drawing', 'Catalogue', 'Other'));

CREATE INDEX IF NOT EXISTS idx_quotation_attachments_quotation
  ON quotation_attachments(quotation_id);

-- Vendor performance ratings
CREATE TABLE IF NOT EXISTS vendor_performance_ratings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  price_rating NUMERIC(3, 1) CHECK (price_rating >= 1 AND price_rating <= 5),
  delivery_rating NUMERIC(3, 1) CHECK (delivery_rating >= 1 AND delivery_rating <= 5),
  quality_rating NUMERIC(3, 1) CHECK (quality_rating >= 1 AND quality_rating <= 5),
  service_rating NUMERIC(3, 1) CHECK (service_rating >= 1 AND service_rating <= 5),
  overall_rating NUMERIC(3, 1) CHECK (overall_rating >= 1 AND overall_rating <= 5),
  notes TEXT,
  rated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  rated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vpr_tenant_vendor
  ON vendor_performance_ratings(tenant_id, vendor_id, rated_at DESC);

COMMENT ON TABLE quotation_items IS 'Normalized quotation line items with rate intelligence fields.';
COMMENT ON TABLE vendor_price_history IS 'Historical vendor quoted rates for trend analysis and auto-fill.';
COMMENT ON TABLE quotation_attachments IS 'Multi-document attachments per quotation.';
COMMENT ON TABLE vendor_performance_ratings IS 'Vendor procurement performance scores (1-5 stars).';
