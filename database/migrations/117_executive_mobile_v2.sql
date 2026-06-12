-- Executive Mobile v2: capture source tracking + cost center on unposted transactions.

ALTER TABLE unposted_transactions ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'EXECUTIVE_APP';
ALTER TABLE unposted_transactions ADD COLUMN IF NOT EXISTS cost_center_code TEXT;

ALTER TABLE unposted_transactions DROP CONSTRAINT IF EXISTS unposted_transactions_source_check;
ALTER TABLE unposted_transactions ADD CONSTRAINT unposted_transactions_source_check
  CHECK (source IN ('EXECUTIVE_APP', 'DESKTOP', 'API'));

CREATE INDEX IF NOT EXISTS idx_unposted_transactions_tenant_source
  ON unposted_transactions (tenant_id, source, created_at DESC)
  WHERE deleted_at IS NULL;
