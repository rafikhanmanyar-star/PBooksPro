-- Vendor quotations and entity documents (aligned with SQLite services/database/schema.ts)
-- Run with: psql $DATABASE_URL -f database/migrations/064_quotations_documents.sql

CREATE TABLE IF NOT EXISTS quotations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vendor_id TEXT NOT NULL REFERENCES vendors(id),
  name TEXT NOT NULL,
  date DATE NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  total_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  document_id TEXT,
  user_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotations_tenant ON quotations(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quotations_vendor ON quotations(vendor_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quotations_date ON quotations(date DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  file_data TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  user_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id) WHERE deleted_at IS NULL;
