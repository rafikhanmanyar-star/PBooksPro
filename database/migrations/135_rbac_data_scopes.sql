-- A5.1.4 — RBAC 2.0 data scope tables (project | property | owner | department)
-- Option A: no company dimension. entity_id NULL = 'all' marker for dimension.

CREATE TABLE IF NOT EXISTS rbac_user_data_scopes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL CHECK (dimension IN ('project', 'property', 'owner', 'department')),
  entity_id TEXT,
  granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rbac_user_data_scopes_unique UNIQUE (tenant_id, user_id, dimension, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_rbac_user_data_scopes_user_active
  ON rbac_user_data_scopes(tenant_id, user_id)
  WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS rbac_role_data_scopes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL CHECK (dimension IN ('project', 'property', 'owner', 'department')),
  entity_id TEXT,
  granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rbac_role_data_scopes_unique UNIQUE (tenant_id, role_id, dimension, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_rbac_role_data_scopes_role_active
  ON rbac_role_data_scopes(tenant_id, role_id)
  WHERE is_active = TRUE;
