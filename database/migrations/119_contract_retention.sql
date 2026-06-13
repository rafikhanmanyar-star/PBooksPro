-- Contract retention management (construction contracts)

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS retention_type VARCHAR(20) NOT NULL DEFAULT 'NONE';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS retention_percentage NUMERIC(10, 2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS retention_amount NUMERIC(18, 2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS retention_release_method VARCHAR(30);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS retention_release_date DATE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS retention_notes TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS retention_balance NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS retention_released NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS retention_release_by TEXT;

CREATE INDEX IF NOT EXISTS idx_contracts_retention_type
  ON contracts(tenant_id, retention_type)
  WHERE deleted_at IS NULL AND retention_type <> 'NONE';
