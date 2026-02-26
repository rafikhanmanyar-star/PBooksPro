-- Migration: Indexes for Rental AR Tree View (ar-summary / ar-children)
-- Date: 2026-02-26
-- Enables fast filtered aggregation by tenant, property, owner (via property), unit, due_date, status.

BEGIN;

-- Invoices: AR queries filter by status != 'Paid' and group by contact/property/unit
CREATE INDEX IF NOT EXISTS idx_invoices_property_id ON invoices(property_id) WHERE property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_unit_id ON invoices(unit_id) WHERE unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(tenant_id, due_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(tenant_id, status) WHERE deleted_at IS NULL;

-- Composite for AR summary: tenant + invoice_type (Rental/Security Deposit) + status
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_type_status ON invoices(tenant_id, invoice_type, status) WHERE deleted_at IS NULL;

COMMIT;
