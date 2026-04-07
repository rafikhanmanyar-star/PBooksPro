-- Income/expense categories (LAN / PostgreSQL). Aligns with services/database/schema.ts (SQLite).
-- Run after 001_lan_core.sql (tenants). Required for rental invoice payments (category_id on transactions).

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  is_permanent BOOLEAN NOT NULL DEFAULT FALSE,
  is_rental BOOLEAN NOT NULL DEFAULT FALSE,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  parent_category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_categories_tenant_updated ON categories(tenant_id, updated_at);
