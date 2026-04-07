-- Multi-user record edit locks (PostgreSQL / LAN API)
-- Run with: npm run db:migrate:lan

CREATE TABLE IF NOT EXISTS record_locks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  locked_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  locked_by_name TEXT NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, record_type, record_id)
);

CREATE INDEX IF NOT EXISTS idx_record_locks_expires ON record_locks (tenant_id, expires_at);
