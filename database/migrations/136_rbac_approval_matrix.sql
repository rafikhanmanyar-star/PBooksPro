-- A5.1.5 — RBAC 2.0 approval matrix (Architecture §6)

CREATE TABLE IF NOT EXISTS rbac_approval_matrix (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rbac_approval_capabilities (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  capability_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  required_permission TEXT NOT NULL,
  max_level INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rbac_approval_capabilities_unique UNIQUE (tenant_id, capability_key)
);

CREATE INDEX IF NOT EXISTS idx_rbac_approval_capabilities_tenant
  ON rbac_approval_capabilities(tenant_id)
  WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS rbac_approval_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  approval_level INTEGER NOT NULL DEFAULT 1,
  min_approvers INTEGER NOT NULL DEFAULT 1,
  allow_self_approval BOOLEAN NOT NULL DEFAULT FALSE,
  required_permission TEXT NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_mandatory BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rbac_approval_rules_tenant_entity
  ON rbac_approval_rules(tenant_id, entity_type, priority)
  WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS rbac_approval_assignments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_id TEXT REFERENCES rbac_approval_rules(id) ON DELETE CASCADE,
  capability_id TEXT REFERENCES rbac_approval_capabilities(id) ON DELETE CASCADE,
  assignee_type TEXT NOT NULL CHECK (assignee_type IN ('user', 'role')),
  assignee_id TEXT NOT NULL,
  approval_level INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rbac_approval_assignments_target CHECK (rule_id IS NOT NULL OR capability_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_rbac_approval_assignments_tenant
  ON rbac_approval_assignments(tenant_id, assignee_type, assignee_id)
  WHERE is_active = TRUE;

-- Pending manual journal payloads (mandatory approval — H4)
CREATE TABLE IF NOT EXISTS rbac_journal_approval_drafts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requester_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('manual_journal', 'journal_reversal')),
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending Approval'
    CHECK (status IN ('Draft', 'Pending Approval', 'Approved', 'Rejected', 'Cancelled')),
  journal_entry_id TEXT,
  original_journal_entry_id TEXT,
  approval_request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rbac_journal_approval_drafts_tenant_status
  ON rbac_journal_approval_drafts(tenant_id, status);
