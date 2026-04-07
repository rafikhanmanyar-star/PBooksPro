-- Buildings & properties (tenant-scoped; properties reference contacts + buildings)
-- Run after 002_contacts.sql. rental_agreements.property_id is not FK-bound yet (legacy rows may exist).

CREATE TABLE IF NOT EXISTS buildings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_buildings_tenant ON buildings(tenant_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE RESTRICT,
  description TEXT,
  monthly_service_charge NUMERIC(18, 2),
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_properties_tenant ON properties(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_properties_building ON properties(tenant_id, building_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_properties_owner ON properties(tenant_id, owner_id) WHERE deleted_at IS NULL;
