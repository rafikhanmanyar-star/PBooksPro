-- Automated backup scheduler: job definitions and run history.

CREATE TABLE IF NOT EXISTS backup_jobs (
  id TEXT PRIMARY KEY,
  job_name TEXT NOT NULL,
  backup_type TEXT NOT NULL CHECK (backup_type IN ('full_pg', 'tenant')),
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  last_run TIMESTAMPTZ,
  next_run TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'failed', 'disabled')),
  retention_days INTEGER NOT NULL DEFAULT 30,
  storage_location TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS backup_job_runs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES backup_jobs(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  size_bytes BIGINT,
  duration_ms INTEGER,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  failure_reason TEXT,
  storage_path TEXT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_jobs_next_run ON backup_jobs (status, next_run);
CREATE INDEX IF NOT EXISTS idx_backup_job_runs_job_started ON backup_job_runs (job_id, started_at DESC);
