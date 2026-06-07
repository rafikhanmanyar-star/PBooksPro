-- Multi-factor authentication (TOTP + recovery codes).

CREATE TABLE IF NOT EXISTS user_mfa_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  secret TEXT,
  backup_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_mfa_settings_tenant ON user_mfa_settings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_mfa_settings_enabled ON user_mfa_settings (tenant_id, enabled);
