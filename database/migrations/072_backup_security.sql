-- Backup security: encryption settings, restore authorization sessions, run metadata.

CREATE TABLE IF NOT EXISTS backup_security_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  encrypt_at_rest BOOLEAN NOT NULL DEFAULT TRUE,
  encrypt_before_upload BOOLEAN NOT NULL DEFAULT TRUE,
  require_restore_authorization BOOLEAN NOT NULL DEFAULT TRUE,
  min_backup_password_length INTEGER NOT NULL DEFAULT 8,
  key_version INTEGER NOT NULL DEFAULT 1,
  key_rotated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO backup_security_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS backup_restore_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_restore_sessions_expires ON backup_restore_sessions (expires_at);

ALTER TABLE backup_job_runs
  ADD COLUMN IF NOT EXISTS encrypted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS encryption_mode TEXT,
  ADD COLUMN IF NOT EXISTS content_sha256 TEXT;
