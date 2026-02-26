-- AR Dashboard performance indexes
-- Optimizes GROUP BY queries for accounts receivable tree view

-- Invoice lookups by property (for building→property→tenant drill-down)
CREATE INDEX IF NOT EXISTS idx_invoices_property_type
  ON invoices (tenant_id, property_id, invoice_type)
  WHERE deleted_at IS NULL;

-- Invoice lookups by contact for tenant grouping
CREATE INDEX IF NOT EXISTS idx_invoices_contact_type
  ON invoices (tenant_id, contact_id, invoice_type)
  WHERE deleted_at IS NULL;

-- Invoice aging queries (status + due_date filtering)
CREATE INDEX IF NOT EXISTS idx_invoices_aging
  ON invoices (tenant_id, due_date, status)
  WHERE deleted_at IS NULL AND invoice_type IN ('Rental', 'Security Deposit');

-- Property owner lookups for owner grouping
CREATE INDEX IF NOT EXISTS idx_properties_owner
  ON properties (tenant_id, owner_id);

-- Property building lookups for building grouping
CREATE INDEX IF NOT EXISTS idx_properties_building
  ON properties (tenant_id, building_id);
