-- Marketing: plan amenities catalog and installment (payment) plans per lead/unit.
-- Aligns with SQLite schema in services/database/schema.ts

CREATE TABLE IF NOT EXISTS plan_amenities (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  price NUMERIC(18, 2) NOT NULL DEFAULT 0,
  is_percentage SMALLINT NOT NULL DEFAULT 0,
  is_active SMALLINT NOT NULL DEFAULT 1,
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_amenities_tenant ON plan_amenities (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_plan_amenities_tenant_updated ON plan_amenities (tenant_id, updated_at);

CREATE TABLE IF NOT EXISTS installment_plans (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  project_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  net_value NUMERIC(18, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  duration_years INTEGER,
  down_payment_percentage NUMERIC(18, 6) DEFAULT 0,
  frequency TEXT,
  list_price NUMERIC(18, 2) DEFAULT 0,
  customer_discount NUMERIC(18, 2) DEFAULT 0,
  floor_discount NUMERIC(18, 2) DEFAULT 0,
  lump_sum_discount NUMERIC(18, 2) DEFAULT 0,
  misc_discount NUMERIC(18, 2) DEFAULT 0,
  down_payment_amount NUMERIC(18, 2) DEFAULT 0,
  installment_amount NUMERIC(18, 2) DEFAULT 0,
  total_installments INTEGER,
  description TEXT,
  user_id TEXT,
  intro_text TEXT,
  root_id TEXT,
  approval_requested_by TEXT,
  approval_requested_to TEXT,
  approval_requested_at TIMESTAMPTZ,
  approval_reviewed_by TEXT,
  approval_reviewed_at TIMESTAMPTZ,
  discounts JSONB,
  customer_discount_category_id TEXT,
  floor_discount_category_id TEXT,
  lump_sum_discount_category_id TEXT,
  misc_discount_category_id TEXT,
  selected_amenities JSONB,
  amenities_total NUMERIC(18, 2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT installment_plans_project_fk
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  CONSTRAINT installment_plans_lead_fk
    FOREIGN KEY (lead_id) REFERENCES contacts (id) ON DELETE RESTRICT,
  CONSTRAINT installment_plans_unit_fk
    FOREIGN KEY (unit_id) REFERENCES units (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_installment_plans_tenant ON installment_plans (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_installment_plans_tenant_updated ON installment_plans (tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_installment_plans_project ON installment_plans (tenant_id, project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_installment_plans_lead ON installment_plans (tenant_id, lead_id) WHERE deleted_at IS NULL;
