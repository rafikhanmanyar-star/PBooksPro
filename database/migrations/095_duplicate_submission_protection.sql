-- Duplicate submission protection: API idempotency log + entity unique constraints
-- Renames duplicate rows (keeps oldest per group) so unique indexes can be created safely.

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

-- Contacts: disambiguate duplicate active names before unique index
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY tenant_id, lower(trim(name)), type
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM contacts
  WHERE deleted_at IS NULL
)
UPDATE contacts AS c
SET
  name = trim(c.name) || ' (' || r.rn::text || ')',
  updated_at = NOW()
FROM ranked AS r
WHERE c.id = r.id AND r.rn > 1;

-- Vendors
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY tenant_id, lower(trim(name))
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM vendors
  WHERE deleted_at IS NULL
)
UPDATE vendors AS v
SET
  name = trim(v.name) || ' (' || r.rn::text || ')',
  updated_at = NOW()
FROM ranked AS r
WHERE v.id = r.id AND r.rn > 1;

-- Projects
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY tenant_id, lower(trim(name))
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM projects
  WHERE deleted_at IS NULL
)
UPDATE projects AS p
SET
  name = trim(p.name) || ' (' || r.rn::text || ')',
  updated_at = NOW()
FROM ranked AS r
WHERE p.id = r.id AND r.rn > 1;

-- Transactions: disambiguate duplicate non-empty references
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY tenant_id, reference
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM transactions
  WHERE deleted_at IS NULL
    AND reference IS NOT NULL
    AND trim(reference) <> ''
)
UPDATE transactions AS t
SET
  reference = trim(t.reference) || '-dup' || r.rn::text,
  updated_at = NOW()
FROM ranked AS r
WHERE t.id = r.id AND r.rn > 1;

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
