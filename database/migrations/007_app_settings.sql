-- Tenant-scoped key/value application settings (mirrors SQLite app_settings JSON values)
-- Run with: psql $DATABASE_URL -f database/migrations/007_app_settings.sql

CREATE TABLE IF NOT EXISTS app_settings (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, key)
);

CREATE INDEX IF NOT EXISTS idx_app_settings_tenant ON app_settings(tenant_id);
