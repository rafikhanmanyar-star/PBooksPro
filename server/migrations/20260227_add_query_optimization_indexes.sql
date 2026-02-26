-- Query optimization indexes for transactions and AR queries
-- Optimizes the most common query patterns identified in the performance audit

-- Transactions: covering index for the common list query (tenant_id + date DESC)
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_date
  ON transactions (tenant_id, date DESC)
  WHERE deleted_at IS NULL;

-- Transactions: index for invoice payment lookups
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_invoice
  ON transactions (tenant_id, invoice_id)
  WHERE deleted_at IS NULL AND invoice_id IS NOT NULL;

-- Transactions: index for bill payment lookups
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_bill
  ON transactions (tenant_id, bill_id)
  WHERE deleted_at IS NULL AND bill_id IS NOT NULL;

-- Transactions: batch payment grouping
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_batch
  ON transactions (tenant_id, batch_id)
  WHERE deleted_at IS NULL AND batch_id IS NOT NULL;

-- Invoices: agreement-based lookups for rental module
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_agreement
  ON invoices (tenant_id, agreement_id)
  WHERE deleted_at IS NULL;

-- Invoices: building-based lookups for AR tree drill-down
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_building
  ON invoices (tenant_id, building_id)
  WHERE deleted_at IS NULL;

-- Contacts: tenant-scoped name lookups for search
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_name
  ON contacts (tenant_id, name)
  WHERE deleted_at IS NULL;
