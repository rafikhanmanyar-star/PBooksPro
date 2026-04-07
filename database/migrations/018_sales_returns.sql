-- Project sales returns — LAN / PostgreSQL (aligns with SQLite sales_returns in services/database/schema.ts)

CREATE TABLE IF NOT EXISTS sales_returns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  return_number TEXT NOT NULL,
  agreement_id TEXT NOT NULL,
  return_date DATE NOT NULL,
  reason TEXT NOT NULL,
  reason_notes TEXT,
  penalty_percentage NUMERIC(18, 6) NOT NULL DEFAULT 0,
  penalty_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  refund_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  processed_date DATE,
  refunded_date DATE,
  refund_bill_id TEXT,
  created_by TEXT,
  notes TEXT,
  user_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sales_returns_tenant_return_number UNIQUE (tenant_id, return_number)
);

CREATE INDEX IF NOT EXISTS idx_sales_returns_tenant ON sales_returns(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sales_returns_tenant_updated ON sales_returns(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_sales_returns_agreement ON sales_returns(tenant_id, agreement_id) WHERE deleted_at IS NULL;
