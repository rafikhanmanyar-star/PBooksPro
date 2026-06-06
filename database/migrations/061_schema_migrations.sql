-- Migration version tracking (Phase A — production readiness).
-- Applied once by backend/src/migrate.ts; do not re-run DDL manually on live DBs.

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON schema_migrations (applied_at);
