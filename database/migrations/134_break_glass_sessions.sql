-- RBAC 2.0 Phase 2 C2 (A5.1.2) — SYSTEM_OWNER break-glass sessions + vendor capability store.

CREATE TABLE IF NOT EXISTS platform_break_glass_capabilities (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by_platform_user_id TEXT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  reason TEXT,
  CONSTRAINT uq_platform_break_glass_capability UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_break_glass_capabilities_tenant
  ON platform_break_glass_capabilities(tenant_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS break_glass_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  end_reason TEXT CHECK (end_reason IS NULL OR end_reason IN ('expired', 'manual', 'superseded')),
  ip_address TEXT,
  user_agent TEXT,
  mfa_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_break_glass_sessions_tenant_active
  ON break_glass_sessions(tenant_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_break_glass_sessions_user_active
  ON break_glass_sessions(user_id)
  WHERE ended_at IS NULL;

-- Extend RBAC audit log for break-glass forensics (C2).
ALTER TABLE rbac_audit_log
  ADD COLUMN IF NOT EXISTS session_id TEXT;

ALTER TABLE rbac_audit_log
  ADD COLUMN IF NOT EXISTS ip_address TEXT;

ALTER TABLE rbac_audit_log
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_rbac_audit_log_session
  ON rbac_audit_log(tenant_id, session_id)
  WHERE session_id IS NOT NULL;
