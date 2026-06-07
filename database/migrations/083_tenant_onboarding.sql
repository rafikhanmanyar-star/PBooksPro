-- Tenant onboarding wizard progress (resume later, step data).

CREATE TABLE IF NOT EXISTS tenant_onboarding (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'skipped')),
  current_step TEXT NOT NULL DEFAULT 'welcome',
  completed_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  step_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_onboarding_status ON tenant_onboarding (status, updated_at DESC);
