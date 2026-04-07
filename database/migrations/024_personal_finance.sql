-- Personal categories & transactions (tenant-scoped; mirrors SQLite personal_* tables)
-- Applied after accounts exist (001_lan_core)

CREATE TABLE IF NOT EXISTS personal_categories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Income', 'Expense')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_categories_tenant ON personal_categories(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_personal_categories_type ON personal_categories(tenant_id, type) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS personal_transactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  personal_category_id TEXT NOT NULL REFERENCES personal_categories(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('Income', 'Expense')),
  amount NUMERIC(18, 2) NOT NULL,
  transaction_date DATE NOT NULL,
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_transactions_tenant ON personal_transactions(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_personal_transactions_account ON personal_transactions(tenant_id, account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_personal_transactions_date ON personal_transactions(tenant_id, transaction_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_personal_transactions_category ON personal_transactions(tenant_id, personal_category_id) WHERE deleted_at IS NULL;
