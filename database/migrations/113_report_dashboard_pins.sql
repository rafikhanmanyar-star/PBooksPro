-- Report Designer Phase 3 — dashboard widget pins for saved report definitions

CREATE TABLE IF NOT EXISTS report_dashboard_pins (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_definition_id TEXT NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id, report_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_report_dashboard_pins_user
  ON report_dashboard_pins(tenant_id, user_id, sort_order);
