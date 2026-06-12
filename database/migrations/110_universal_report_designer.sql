-- Universal Report Designer — extended persistence (JSON configuration; complements custom_report_templates)
-- Phase 1 schema for favorites, sharing, schedules, and normalized definition storage.

CREATE TABLE IF NOT EXISTS report_definitions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  module TEXT NOT NULL,
  report_type TEXT NOT NULL DEFAULT 'tabular',
  tags TEXT[] NOT NULL DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'team', 'company')),
  configuration_json JSONB NOT NULL DEFAULT '{}',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_definitions_tenant_module
  ON report_definitions(tenant_id, module) WHERE is_archived IS FALSE;

CREATE TABLE IF NOT EXISTS report_favorites (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_definition_id TEXT REFERENCES report_definitions(id) ON DELETE CASCADE,
  template_id TEXT REFERENCES custom_report_templates(id) ON DELETE CASCADE,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  last_opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id, report_definition_id),
  UNIQUE (tenant_id, user_id, template_id)
);

CREATE TABLE IF NOT EXISTS report_shares (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  report_definition_id TEXT NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,
  shared_with_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  shared_with_role TEXT,
  permission TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit', 'clone', 'delete')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_shares_definition
  ON report_shares(tenant_id, report_definition_id);

CREATE TABLE IF NOT EXISTS report_schedules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  report_definition_id TEXT NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,
  cadence TEXT NOT NULL CHECK (cadence IN ('daily', 'weekly', 'monthly', 'quarterly')),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  recipients_json JSONB NOT NULL DEFAULT '[]',
  export_format TEXT NOT NULL DEFAULT 'xlsx' CHECK (export_format IN ('pdf', 'xlsx', 'csv')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_schedules_next_run
  ON report_schedules(tenant_id, next_run_at) WHERE is_active IS TRUE;

-- Seed-friendly template catalog (system-wide, read-only presets)
CREATE TABLE IF NOT EXISTS report_templates (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  report_type TEXT NOT NULL DEFAULT 'tabular',
  category TEXT,
  configuration_json JSONB NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_templates_module ON report_templates(module, sort_order);
