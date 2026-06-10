-- Duplicate submission protection: API idempotency log + entity unique constraints

CREATE TABLE IF NOT EXISTS api_request_log (
  id TEXT PRIMARY KEY,
  request_id VARCHAR(255) UNIQUE NOT NULL,
  endpoint VARCHAR(255),
  user_id TEXT,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  response_status INTEGER NOT NULL DEFAULT 200,
  response_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_request_log_created ON api_request_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_log_tenant ON api_request_log(tenant_id) WHERE tenant_id IS NOT NULL;

-- Contacts (owners, customers/clients, tenants, etc.): unique name per type within tenant
CREATE UNIQUE INDEX IF NOT EXISTS contacts_tenant_name_type_unique
  ON contacts (tenant_id, lower(trim(name)), type)
  WHERE deleted_at IS NULL;

-- Vendors directory
CREATE UNIQUE INDEX IF NOT EXISTS vendors_tenant_name_unique
  ON vendors (tenant_id, lower(trim(name)))
  WHERE deleted_at IS NULL;

-- Projects (no project_code column — unique name per tenant)
CREATE UNIQUE INDEX IF NOT EXISTS projects_tenant_name_unique
  ON projects (tenant_id, lower(trim(name)))
  WHERE deleted_at IS NULL;

-- Financial transactions: unique non-empty reference per tenant
CREATE UNIQUE INDEX IF NOT EXISTS transactions_tenant_reference_unique
  ON transactions (tenant_id, reference)
  WHERE deleted_at IS NULL AND reference IS NOT NULL AND trim(reference) <> '';
