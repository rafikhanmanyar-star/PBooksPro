-- Custom report templates + audit (tenant-scoped, PostgreSQL / LAN API)
-- Optional granular permissions overlay on users (null = derive from role in app)

CREATE TABLE IF NOT EXISTS custom_report_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  module TEXT NOT NULL,
  configuration_json JSONB NOT NULL DEFAULT '{}',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_report_templates_tenant
  ON custom_report_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_custom_report_templates_module
  ON custom_report_templates(tenant_id, module);

CREATE UNIQUE INDEX IF NOT EXISTS uq_custom_report_default_per_owner_module
  ON custom_report_templates(tenant_id, module, COALESCE(created_by, ''))
  WHERE is_default IS TRUE;

CREATE TABLE IF NOT EXISTS report_builder_audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  report_name TEXT,
  template_id TEXT,
  detail_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_builder_audit_tenant
  ON report_builder_audit_log(tenant_id, created_at DESC);

ALTER TABLE users ADD COLUMN IF NOT EXISTS feature_permissions JSONB DEFAULT NULL;

-- Reporting workload indexes (project selling / agreements)
CREATE INDEX IF NOT EXISTS idx_project_agreements_tenant_issue_date
  ON project_agreements(tenant_id, issue_date)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_agreements_tenant_rebate_broker
  ON project_agreements(tenant_id, rebate_broker_id)
  WHERE deleted_at IS NULL AND rebate_broker_id IS NOT NULL;
