-- Project selling agreements + unit junction (tenant-scoped; FKs to contacts/projects/units)
-- Applied after 005_projects_units.sql, 002_contacts.sql

CREATE TABLE IF NOT EXISTS project_agreements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agreement_number TEXT NOT NULL,
  client_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  unit_ids TEXT,
  list_price NUMERIC(18, 2),
  customer_discount NUMERIC(18, 2),
  floor_discount NUMERIC(18, 2),
  lump_sum_discount NUMERIC(18, 2),
  misc_discount NUMERIC(18, 2),
  selling_price NUMERIC(18, 2) NOT NULL,
  rebate_amount NUMERIC(18, 2),
  rebate_broker_id TEXT,
  issue_date DATE,
  description TEXT,
  status TEXT NOT NULL,
  cancellation_details JSONB,
  installment_plan JSONB,
  list_price_category_id TEXT,
  customer_discount_category_id TEXT,
  floor_discount_category_id TEXT,
  lump_sum_discount_category_id TEXT,
  misc_discount_category_id TEXT,
  selling_price_category_id TEXT,
  rebate_category_id TEXT,
  user_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, agreement_number)
);

CREATE INDEX IF NOT EXISTS idx_project_agreements_tenant ON project_agreements(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_agreements_client ON project_agreements(tenant_id, client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_agreements_project ON project_agreements(tenant_id, project_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS project_agreement_units (
  agreement_id TEXT NOT NULL REFERENCES project_agreements(id) ON DELETE CASCADE,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  PRIMARY KEY (agreement_id, unit_id)
);

CREATE INDEX IF NOT EXISTS idx_project_agreement_units_unit ON project_agreement_units(unit_id);
