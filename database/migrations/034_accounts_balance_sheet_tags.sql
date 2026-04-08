-- Optional IFRS/GAAP balance sheet classification (tag-based; account names stay user-defined).
-- Apply with: npm run db:migrate:lan (PostgreSQL).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'accounts' AND column_name = 'bs_position'
  ) THEN
    ALTER TABLE accounts ADD COLUMN bs_position TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'accounts' AND column_name = 'bs_term'
  ) THEN
    ALTER TABLE accounts ADD COLUMN bs_term TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'accounts' AND column_name = 'bs_group_key'
  ) THEN
    ALTER TABLE accounts ADD COLUMN bs_group_key TEXT;
  END IF;
END $$;

COMMENT ON COLUMN accounts.bs_position IS 'asset | liability | equity — override when chart type is ambiguous';
COMMENT ON COLUMN accounts.bs_term IS 'current | non_current';
COMMENT ON COLUMN accounts.bs_group_key IS 'Line key for grouping (e.g. ppe, bank_accounts) — optional';
