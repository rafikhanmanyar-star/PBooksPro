-- P0-B Migration 2 — Category → GL account mapping.
-- Makes a category a reporting dimension that resolves to a posting (revenue/expense/COGS) account.
-- Tenant-isolated: UNIQUE(tenant_id, category_id). System defaults live under tenant_id = '__system__'.
-- Apply with: npm run db:migrate:lan.

CREATE TABLE IF NOT EXISTS category_account_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  gl_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_cat_acct_map_tenant ON category_account_mapping(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cat_acct_map_category ON category_account_mapping(category_id);
CREATE INDEX IF NOT EXISTS idx_cat_acct_map_account ON category_account_mapping(gl_account_id);

COMMENT ON TABLE category_account_mapping IS
  'Resolves a category (P&L reporting dimension) to the GL revenue/expense/COGS account it posts to. Tenant-scoped; system defaults under __system__.';
