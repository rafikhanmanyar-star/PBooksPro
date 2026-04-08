-- Chart of accounts extensions: code, sub_type, is_active (trial balance & reporting).
-- Apply with: npm run db:migrate:lan (PostgreSQL).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'accounts' AND column_name = 'account_code'
  ) THEN
    ALTER TABLE accounts ADD COLUMN account_code TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'accounts' AND column_name = 'sub_type'
  ) THEN
    ALTER TABLE accounts ADD COLUMN sub_type TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'accounts' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE accounts ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_tenant_account_code_unique
  ON accounts(tenant_id, account_code)
  WHERE account_code IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN accounts.account_code IS 'User-defined account code; unique per tenant when set';
COMMENT ON COLUMN accounts.sub_type IS 'Optional: current | non_current | revenue | cogs | opex | ...';
COMMENT ON COLUMN accounts.is_active IS 'Inactive accounts are hidden from pickers; journal history may still reference them';

CREATE OR REPLACE VIEW chart_of_accounts AS
SELECT
  id,
  tenant_id,
  name,
  account_code AS code,
  type,
  sub_type,
  parent_account_id AS parent_id,
  COALESCE(is_active, TRUE) AS is_active,
  description,
  created_at,
  updated_at
FROM accounts
WHERE deleted_at IS NULL;
