-- Tenant restore audit trail.

CREATE TABLE IF NOT EXISTS tenant_restore_runs (
  id TEXT PRIMARY KEY,
  source_tenant_id TEXT,
  target_tenant_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('existing_tenant', 'new_tenant')),
  conflict_policy TEXT NOT NULL CHECK (conflict_policy IN ('replace', 'skip', 'merge')),
  status TEXT NOT NULL CHECK (status IN ('preview', 'completed', 'failed', 'rolled_back')),
  preview_report JSONB,
  result_summary JSONB,
  failure_reason TEXT,
  requested_by TEXT REFERENCES users(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_restore_runs_target ON tenant_restore_runs (target_tenant_id, created_at DESC);
