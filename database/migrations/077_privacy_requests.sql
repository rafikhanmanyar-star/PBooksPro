-- Data privacy management: subject access requests and processing audit trail.

CREATE TABLE IF NOT EXISTS privacy_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  requested_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_tenant ON privacy_requests (tenant_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_status ON privacy_requests (tenant_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_user ON privacy_requests (requested_by_user_id, requested_at DESC);
