-- Offsite backup storage configuration and upload tracking.

CREATE TABLE IF NOT EXISTS backup_storage_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  provider TEXT NOT NULL CHECK (provider IN ('aws_s3', 'cloudflare_r2', 'backblaze_b2', 'azure_blob')),
  access_key_encrypted TEXT NOT NULL DEFAULT '',
  secret_key_encrypted TEXT NOT NULL DEFAULT '',
  bucket_name TEXT NOT NULL DEFAULT '',
  region TEXT,
  endpoint_url TEXT,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  auto_upload BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS backup_offsite_uploads (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES backup_job_runs(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'uploading', 'verifying', 'completed', 'failed')
  ),
  local_sha256 TEXT,
  remote_sha256 TEXT,
  remote_etag TEXT,
  encrypted BOOLEAN NOT NULL DEFAULT TRUE,
  size_bytes BIGINT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failure_reason TEXT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_offsite_uploads_run ON backup_offsite_uploads (run_id);
CREATE INDEX IF NOT EXISTS idx_backup_offsite_uploads_status ON backup_offsite_uploads (status, created_at DESC);
