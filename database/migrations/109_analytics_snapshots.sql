-- Architecture v2: pre-calculated dashboard KPI snapshots.

CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  kpi_key TEXT NOT NULL,
  value_numeric NUMERIC(18, 4),
  value_json JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period_start DATE,
  period_end DATE,
  CONSTRAINT analytics_snapshots_unique UNIQUE (tenant_id, snapshot_date, kpi_key)
);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_tenant_date
  ON analytics_snapshots(tenant_id, snapshot_date DESC);

COMMENT ON TABLE analytics_snapshots IS 'Pre-calculated KPIs for dashboard (not raw journal scans)';
