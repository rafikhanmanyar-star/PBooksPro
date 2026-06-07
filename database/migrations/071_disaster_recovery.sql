-- Disaster Recovery Center: verification, restore tests, alerts, reports.

CREATE TABLE IF NOT EXISTS dr_verification_runs (
  id TEXT PRIMARY KEY,
  backup_run_id TEXT REFERENCES backup_job_runs(id) ON DELETE SET NULL,
  offsite_upload_id TEXT REFERENCES backup_offsite_uploads(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'passed', 'failed')),
  verification_type TEXT NOT NULL DEFAULT 'integrity',
  file_path TEXT,
  file_size_bytes BIGINT,
  sha256 TEXT,
  pg_restore_list_ok BOOLEAN,
  toc_entry_count INTEGER,
  integrity_score INTEGER,
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  failure_reason TEXT,
  requested_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dr_restore_tests (
  id TEXT PRIMARY KEY,
  backup_run_id TEXT REFERENCES backup_job_runs(id) ON DELETE SET NULL,
  test_type TEXT NOT NULL CHECK (test_type IN ('simulation', 'recovery')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'passed', 'failed')),
  duration_ms INTEGER,
  simulation_details JSONB,
  failure_reason TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  requested_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dr_alerts (
  id TEXT PRIMARY KEY,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_run_id TEXT,
  related_job_id TEXT,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT REFERENCES users(id),
  email_sent BOOLEAN NOT NULL DEFAULT FALSE,
  email_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dr_notification_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  email_recipients TEXT[] NOT NULL DEFAULT '{}',
  alert_on_backup_failure BOOLEAN NOT NULL DEFAULT TRUE,
  alert_on_verification_failure BOOLEAN NOT NULL DEFAULT TRUE,
  alert_on_stale_backup BOOLEAN NOT NULL DEFAULT TRUE,
  stale_backup_hours INTEGER NOT NULL DEFAULT 48,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dr_reports (
  id TEXT PRIMARY KEY,
  report_type TEXT NOT NULL CHECK (report_type IN ('daily_health', 'manual', 'weekly')),
  health_score INTEGER NOT NULL,
  summary JSONB NOT NULL,
  requested_by TEXT REFERENCES users(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dr_verification_runs_started ON dr_verification_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_dr_restore_tests_started ON dr_restore_tests (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_dr_alerts_created ON dr_alerts (acknowledged, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dr_reports_generated ON dr_reports (generated_at DESC);

INSERT INTO dr_notification_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
