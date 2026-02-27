-- Performance optimization indexes migration
-- Fixes index name collision, adds missing composite indexes, drops dead/redundant indexes

-- Fix: idx_transactions_tenant_date was defined twice with different definitions.
-- The partial index (WHERE deleted_at IS NULL, DESC) was silently skipped due to IF NOT EXISTS.
DROP INDEX IF EXISTS idx_transactions_tenant_date;
CREATE INDEX idx_transactions_tenant_date ON transactions(tenant_id, date DESC)
  WHERE deleted_at IS NULL;

-- Status-based dashboard/filtering queries
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_status
  ON invoices(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bills_tenant_status
  ON bills(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rental_agreements_org_status
  ON rental_agreements(org_id, status) WHERE deleted_at IS NULL;

-- Type-based filtering
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_type
  ON transactions(tenant_id, type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_type
  ON contacts(tenant_id, type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_tenant_type
  ON accounts(tenant_id, type) WHERE deleted_at IS NULL;

-- FK lookups with tenant scoping
CREATE INDEX IF NOT EXISTS idx_rental_agreements_org_property
  ON rental_agreements(org_id, property_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rental_agreements_org_contact
  ON rental_agreements(org_id, contact_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_unit
  ON invoices(tenant_id, unit_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_category
  ON transactions(tenant_id, category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_project
  ON transactions(tenant_id, project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_agreement_perf
  ON transactions(tenant_id, agreement_id) WHERE deleted_at IS NULL;

-- Vendor/bill lookups
CREATE INDEX IF NOT EXISTS idx_bills_tenant_vendor
  ON bills(tenant_id, vendor_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bills_tenant_project
  ON bills(tenant_id, project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bills_tenant_due_status
  ON bills(tenant_id, due_date, status) WHERE deleted_at IS NULL;

-- Project filtering
CREATE INDEX IF NOT EXISTS idx_projects_tenant_status
  ON projects(tenant_id, status) WHERE deleted_at IS NULL;

-- Drop dead indexes (reference deprecated tenant_id column in rental_agreements)
DROP INDEX IF EXISTS idx_rental_agreements_tenant;
DROP INDEX IF EXISTS idx_rental_agreements_tenant_updated;

-- Drop redundant indexes (duplicate of UNIQUE constraint implicit indexes)
DROP INDEX IF EXISTS idx_user_sessions_token;
DROP INDEX IF EXISTS idx_user_sessions_user_tenant;
