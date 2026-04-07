-- PM cycle fee allocations (project construction PM % of expenses), linked to bills when created from the app.
-- Aligns with SQLite schema in services/database/schema.ts

CREATE TABLE IF NOT EXISTS pm_cycle_allocations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  project_id TEXT NOT NULL,
  cycle_id TEXT NOT NULL,
  cycle_label TEXT NOT NULL,
  frequency TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  allocation_date DATE NOT NULL,
  amount NUMERIC(18, 2) NOT NULL,
  paid_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid',
  bill_id TEXT,
  description TEXT,
  expense_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  fee_rate NUMERIC(18, 6) NOT NULL,
  excluded_category_ids TEXT,
  user_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pm_cycle_allocations_project_fk
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  CONSTRAINT pm_cycle_allocations_bill_fk
    FOREIGN KEY (bill_id) REFERENCES bills (id) ON DELETE SET NULL
);

-- One active allocation per project + cycle (soft-deleted rows do not block a new cycle run)
CREATE UNIQUE INDEX IF NOT EXISTS uq_pm_cycle_allocations_tenant_project_cycle_active
  ON pm_cycle_allocations (tenant_id, project_id, cycle_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pm_cycle_allocations_tenant ON pm_cycle_allocations (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pm_cycle_allocations_tenant_updated ON pm_cycle_allocations (tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_pm_cycle_allocations_project ON pm_cycle_allocations (tenant_id, project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pm_cycle_allocations_cycle ON pm_cycle_allocations (tenant_id, cycle_id) WHERE deleted_at IS NULL;
