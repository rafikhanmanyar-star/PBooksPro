-- Project budget planner (per category + project). Aligns with SQLite `budgets` in services/database/schema.ts.
-- Run after 011_categories.sql and 005_projects_units.sql.

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  amount NUMERIC(18, 2) NOT NULL,
  user_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, category_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_budgets_tenant ON budgets(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_budgets_tenant_updated ON budgets(tenant_id, updated_at);
