-- Projects & units (tenant-scoped; units reference projects + optional owner contact)
-- Run after 002_contacts.sql (contacts FK). Uses TEXT ids consistent with LAN schema.

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT,
  project_type TEXT,
  description TEXT,
  color TEXT,
  status TEXT,
  pm_config JSONB,
  installment_config JSONB,
  user_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  unit_number TEXT NOT NULL,
  floor TEXT,
  unit_type TEXT,
  size TEXT,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sold', 'rented', 'blocked')),
  owner_contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  sale_price NUMERIC(18, 2),
  description TEXT,
  area NUMERIC(18, 2),
  user_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_units_project_unit_number
  ON units (project_id, unit_number)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_units_project ON units(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_units_status ON units(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_units_tenant ON units(tenant_id) WHERE deleted_at IS NULL;
