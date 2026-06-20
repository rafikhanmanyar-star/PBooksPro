-- RBAC 2.0 Phase 2 (A5.1.2): role templates, audit log, version hash, assignment lifecycle.
-- Additive only — existing rbac_roles / rbac_user_roles data preserved.

-- Extend role status for archive/restore workflow.
ALTER TABLE rbac_roles DROP CONSTRAINT IF EXISTS rbac_roles_status_check;
ALTER TABLE rbac_roles ADD CONSTRAINT rbac_roles_status_check
  CHECK (status IN ('active', 'inactive', 'archived'));

ALTER TABLE rbac_roles
  ADD COLUMN IF NOT EXISTS role_type TEXT NOT NULL DEFAULT 'custom'
    CHECK (role_type IN ('system', 'custom', 'template_instance'));

ALTER TABLE rbac_roles
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE rbac_roles
  ADD COLUMN IF NOT EXISTS role_version_hash TEXT;

ALTER TABLE rbac_roles
  ADD COLUMN IF NOT EXISTS template_id TEXT;

CREATE INDEX IF NOT EXISTS idx_rbac_roles_tenant_archived
  ON rbac_roles(tenant_id, archived_at)
  WHERE archived_at IS NOT NULL;

-- User access version for Phase 3 cache invalidation (increment on assignment changes).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS access_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS rbac_global_version INTEGER NOT NULL DEFAULT 1;

-- Assignment lifecycle: active flag + optional expiry.
ALTER TABLE rbac_user_roles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE rbac_user_roles
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_rbac_user_roles_active
  ON rbac_user_roles(tenant_id, user_id)
  WHERE is_active = TRUE;

-- Industry role templates (global catalog — permission keys validated at runtime from shared/rbac/roleTemplates.ts).
CREATE TABLE IF NOT EXISTS rbac_role_templates (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'industry',
  permission_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rbac_role_templates_status ON rbac_role_templates(status);

-- RBAC-specific audit trail (separate from enterprise audit_events).
CREATE TABLE IF NOT EXISTS rbac_audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'system', 'system_owner')),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_role_id TEXT REFERENCES rbac_roles(id) ON DELETE SET NULL,
  reason TEXT,
  before_state JSONB,
  after_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rbac_audit_log_tenant_created
  ON rbac_audit_log(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rbac_audit_log_target_role
  ON rbac_audit_log(tenant_id, target_role_id)
  WHERE target_role_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rbac_audit_log_target_user
  ON rbac_audit_log(tenant_id, target_user_id)
  WHERE target_user_id IS NOT NULL;
