-- IFRS/GAAP P&L: map income/expense categories (natural P&L "accounts") to statement lines.
-- pl_type: revenue | cost_of_sales | operating_expense | other_income | finance_cost | tax

CREATE TABLE IF NOT EXISTS pl_category_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  pl_type TEXT NOT NULL CHECK (pl_type IN (
    'revenue',
    'cost_of_sales',
    'operating_expense',
    'other_income',
    'finance_cost',
    'tax'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_pl_category_mapping_tenant ON pl_category_mapping(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pl_category_mapping_category ON pl_category_mapping(category_id);

COMMENT ON TABLE pl_category_mapping IS 'Maps categories (P&L natural accounts) to profit and loss statement buckets; no hardcoded category names in reports.';
