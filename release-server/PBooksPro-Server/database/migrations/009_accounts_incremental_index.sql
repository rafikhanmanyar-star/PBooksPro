-- Speed up incremental sync for chart of accounts (GET /api/state/changes)
CREATE INDEX IF NOT EXISTS idx_accounts_tenant_updated ON accounts(tenant_id, updated_at);
