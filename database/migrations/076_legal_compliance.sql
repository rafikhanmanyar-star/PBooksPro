-- Legal compliance: document acceptance audit trail.

CREATE TABLE IF NOT EXISTS legal_acceptance (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  document_type TEXT NOT NULL,
  document_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  context TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legal_acceptance_tenant ON legal_acceptance (tenant_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_acceptance_user ON legal_acceptance (user_id, document_type, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_acceptance_type ON legal_acceptance (document_type, document_version);
