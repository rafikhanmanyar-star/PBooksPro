-- Restore schema for the standalone PBooksPro admin portal (tenant/license management).

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_users_valid_role CHECK (role IN ('super_admin', 'admin'))
);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS license_type TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS license_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS license_key TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_start_date TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS license_start_date TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS license_expiry_date TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS last_renewal_date TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS next_renewal_date TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 20;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_projects INTEGER DEFAULT 10;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free';

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_license_key ON tenants (license_key) WHERE license_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS license_keys (
  id TEXT PRIMARY KEY,
  license_key TEXT UNIQUE NOT NULL,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  license_type TEXT NOT NULL,
  device_id TEXT,
  issued_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_date TIMESTAMPTZ,
  expiry_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS license_history (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  license_key_id TEXT REFERENCES license_keys(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  from_type TEXT,
  to_type TEXT,
  payment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_license_history_tenant ON license_history (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tenant_modules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, module_key)
);

-- Default admin account (password: admin123) — only when table is empty.
INSERT INTO admin_users (id, username, name, email, password, role, is_active)
SELECT
  'admin_1',
  'Admin',
  'Super Admin',
  'admin@pbookspro.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  'super_admin',
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM admin_users LIMIT 1);
