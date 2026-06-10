-- Multi-tenant user ↔ organization membership (maps to user_companies in product docs).
-- Each row links a tenant-scoped users.id to a tenant (organization).

CREATE TABLE IF NOT EXISTS user_tenants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  last_selected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_user_tenants_user_id ON user_tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant_id ON user_tenants(tenant_id);

-- Backfill: every active user belongs to their current tenant.
INSERT INTO user_tenants (id, user_id, tenant_id, role, is_default, created_at)
SELECT
  'ut_' || u.id,
  u.id,
  u.tenant_id,
  u.role,
  TRUE,
  COALESCE(u.created_at, NOW())
FROM users u
WHERE u.is_active = TRUE
ON CONFLICT (user_id, tenant_id) DO NOTHING;

-- Remember last organization per user record (used for preferred company on login).
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL;
