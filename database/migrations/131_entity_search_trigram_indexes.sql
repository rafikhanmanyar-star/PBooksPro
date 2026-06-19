-- PERF-A3.4 — trigram GIN indexes for server-side ILIKE entity search.
-- Enables fast substring search on catalog/list columns without full table scans.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Contacts: name already has B-tree (tenant, name); add trigram for ILIKE across text fields
CREATE INDEX IF NOT EXISTS idx_contacts_search_name_trgm
  ON contacts USING gin (name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_search_company_trgm
  ON contacts USING gin (company_name gin_trgm_ops)
  WHERE deleted_at IS NULL AND company_name IS NOT NULL;

-- Vendors
CREATE INDEX IF NOT EXISTS idx_vendors_search_name_trgm
  ON vendors USING gin (name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vendors_search_company_trgm
  ON vendors USING gin (company_name gin_trgm_ops)
  WHERE deleted_at IS NULL AND company_name IS NOT NULL;

-- Transactions (ledger search: description + reference)
CREATE INDEX IF NOT EXISTS idx_transactions_search_desc_trgm
  ON transactions USING gin (description gin_trgm_ops)
  WHERE deleted_at IS NULL AND description IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_search_ref_trgm
  ON transactions USING gin (reference gin_trgm_ops)
  WHERE deleted_at IS NULL AND reference IS NOT NULL;

-- Payroll employees
CREATE INDEX IF NOT EXISTS idx_payroll_employees_search_name_trgm
  ON payroll_employees USING gin (name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_employees_search_code_trgm
  ON payroll_employees USING gin (employee_code gin_trgm_ops)
  WHERE deleted_at IS NULL AND employee_code IS NOT NULL;

-- Properties (rental units)
CREATE INDEX IF NOT EXISTS idx_properties_search_name_trgm
  ON properties USING gin (name gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- Units / project-selling inventory (no SKU/barcode columns — unit_number + description)
CREATE INDEX IF NOT EXISTS idx_units_search_number_trgm
  ON units USING gin (unit_number gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_units_search_desc_trgm
  ON units USING gin (description gin_trgm_ops)
  WHERE deleted_at IS NULL AND description IS NOT NULL;

-- Invoices: invoice number search (referenced in task; used by global search paths)
CREATE INDEX IF NOT EXISTS idx_invoices_search_number_trgm
  ON invoices USING gin (invoice_number gin_trgm_ops)
  WHERE deleted_at IS NULL AND invoice_number IS NOT NULL;
