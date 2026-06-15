-- Sprint 4: Universal Approval Workflow Engine

CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  approval_workflow_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  workflow_config JSONB NOT NULL DEFAULT '{"levels":3,"rules":[]}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_ref TEXT,
  requester_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  current_level INTEGER NOT NULL DEFAULT 1,
  max_level INTEGER NOT NULL DEFAULT 1,
  amount NUMERIC(18, 2),
  department_id TEXT,
  project_id TEXT,
  previous_status TEXT,
  target_status TEXT,
  assigned_approver_id TEXT,
  comments TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_tenant_status
  ON approval_requests (tenant_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_approval_requests_entity
  ON approval_requests (tenant_id, entity_type, entity_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_approval_requests_assigned
  ON approval_requests (tenant_id, assigned_approver_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS approval_request_actions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  approval_request_id TEXT NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_id TEXT,
  approval_level INTEGER,
  previous_status TEXT,
  new_status TEXT,
  comments TEXT,
  delegate_to_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_request_actions_request
  ON approval_request_actions (tenant_id, approval_request_id, created_at);
