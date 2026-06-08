-- Transaction audit log (aligned with SQLite services/database/schema.ts transaction_log)
-- Run with: psql $DATABASE_URL -f database/migrations/065_transaction_log.sql

CREATE TABLE IF NOT EXISTS transaction_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  description TEXT NOT NULL,
  user_id TEXT,
  user_label TEXT,
  data JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transaction_log_tenant_ts ON transaction_log(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transaction_log_entity ON transaction_log(tenant_id, entity_id) WHERE entity_id IS NOT NULL;
