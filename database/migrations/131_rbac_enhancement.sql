-- Tenant-scoped RBAC: custom roles, permission assignments, user role links.
-- Seeds SYSTEM_OWNER, enterprise system roles, and Security Administrator per tenant.

CREATE TABLE IF NOT EXISTS rbac_roles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_protected BOOLEAN NOT NULL DEFAULT FALSE,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_rbac_roles_tenant ON rbac_roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rbac_roles_tenant_visible ON rbac_roles(tenant_id) WHERE is_hidden = FALSE;

CREATE TABLE IF NOT EXISTS rbac_role_permissions (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_rbac_role_permissions_tenant ON rbac_role_permissions(tenant_id);

CREATE TABLE IF NOT EXISTS rbac_user_roles (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by TEXT,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_rbac_user_roles_tenant_user ON rbac_user_roles(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_rbac_user_roles_role ON rbac_user_roles(role_id);

-- Seed roles for every tenant (idempotent).
INSERT INTO rbac_roles (id, tenant_id, slug, name, description, status, is_system, is_protected, is_hidden)
SELECT
  'rbac_' || t.id || '_system_owner',
  t.id,
  'SYSTEM_OWNER',
  'System Owner',
  'Bootstrap recovery role with all permissions. Hidden from standard role management.',
  'active',
  TRUE,
  TRUE,
  TRUE
FROM tenants t
ON CONFLICT (tenant_id, slug) DO NOTHING;

INSERT INTO rbac_roles (id, tenant_id, slug, name, description, status, is_system, is_protected, is_hidden)
SELECT
  'rbac_' || t.id || '_security_administrator',
  t.id,
  'security_administrator',
  'Security Administrator',
  'Manage roles, permissions, and user role assignments without system configuration access.',
  'active',
  TRUE,
  TRUE,
  FALSE
FROM tenants t
ON CONFLICT (tenant_id, slug) DO NOTHING;

INSERT INTO rbac_roles (id, tenant_id, slug, name, description, status, is_system, is_protected, is_hidden)
SELECT
  'rbac_' || t.id || '_' || r.slug,
  t.id,
  r.slug,
  r.name,
  r.description,
  'active',
  TRUE,
  TRUE,
  FALSE
FROM tenants t
CROSS JOIN (
  VALUES
    ('super_admin', 'Super Admin', 'Full tenant access including all permissions'),
    ('company_admin', 'Company Admin', 'Tenant administrator'),
    ('accountant', 'Accountant', 'Financial operations and reporting'),
    ('project_manager', 'Project Manager', 'Project and procurement workflows'),
    ('sales_user', 'Sales User', 'Project selling workflows'),
    ('read_only', 'Read Only User', 'Read-only access to reports and data')
) AS r(slug, name, description)
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- Security Administrator default permissions.
INSERT INTO rbac_role_permissions (tenant_id, role_id, permission_key)
SELECT r.tenant_id, r.id, p.key
FROM rbac_roles r
CROSS JOIN (
  VALUES
    ('roles.view'),
    ('roles.manage'),
    ('permissions.view'),
    ('permissions.manage'),
    ('users.role.assign')
) AS p(key)
WHERE r.slug = 'security_administrator'
ON CONFLICT DO NOTHING;

-- Link existing users to enterprise roles (legacy users.role → rbac_roles.slug).
INSERT INTO rbac_user_roles (tenant_id, user_id, role_id, assigned_by)
SELECT
  ut.tenant_id,
  ut.user_id,
  rr.id,
  NULL
FROM user_tenants ut
INNER JOIN rbac_roles rr
  ON rr.tenant_id = ut.tenant_id
 AND rr.slug = CASE
    WHEN LOWER(REPLACE(REPLACE(TRIM(ut.role), ' ', '_'), '-', '_')) IN ('super_admin', 'system_owner') THEN 'super_admin'
    WHEN LOWER(REPLACE(REPLACE(TRIM(ut.role), ' ', '_'), '-', '_')) IN ('admin', 'company_admin', 'manager') THEN 'company_admin'
    WHEN LOWER(REPLACE(REPLACE(TRIM(ut.role), ' ', '_'), '-', '_')) IN ('accounts', 'accountant') THEN 'accountant'
    WHEN LOWER(REPLACE(REPLACE(TRIM(ut.role), ' ', '_'), '-', '_')) IN ('project_manager', 'team_lead') THEN 'project_manager'
    WHEN LOWER(REPLACE(REPLACE(TRIM(ut.role), ' ', '_'), '-', '_')) IN ('sales_user', 'sales') THEN 'sales_user'
    WHEN LOWER(REPLACE(REPLACE(TRIM(ut.role), ' ', '_'), '-', '_')) IN ('read_only', 'read_only_user', 'viewer', 'task_contributor') THEN 'read_only'
    ELSE 'read_only'
  END
ON CONFLICT DO NOTHING;
