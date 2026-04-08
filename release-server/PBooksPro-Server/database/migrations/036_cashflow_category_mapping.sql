-- IAS 7 cash flow: optional chart account → operating | investing | financing (e.g. interest classification).
-- Apply with: npm run db:migrate:lan (PostgreSQL).

CREATE TABLE IF NOT EXISTS cashflow_category_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('operating', 'investing', 'financing')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_cashflow_cat_map_tenant ON cashflow_category_mapping(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cashflow_cat_map_account ON cashflow_category_mapping(account_id);

COMMENT ON TABLE cashflow_category_mapping IS 'Optional overrides for classifying cash effects of transactions involving the given account (direct method).';
