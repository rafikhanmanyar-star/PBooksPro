-- Project received assets (non-cash consideration: plot, car, etc.) — LAN / PostgreSQL
-- Aligns with SQLite project_received_assets in services/database/schema.ts

CREATE TABLE IF NOT EXISTS project_received_assets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  project_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  invoice_id TEXT,
  description TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  recorded_value NUMERIC(18, 2) NOT NULL,
  received_date DATE NOT NULL,
  sold_date DATE,
  sale_amount NUMERIC(18, 2),
  sale_account_id TEXT,
  notes TEXT,
  user_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_received_assets_tenant ON project_received_assets(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_received_assets_tenant_updated ON project_received_assets(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_project_received_assets_project ON project_received_assets(tenant_id, project_id) WHERE deleted_at IS NULL;
