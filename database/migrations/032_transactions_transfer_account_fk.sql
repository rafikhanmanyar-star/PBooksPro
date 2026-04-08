-- Optional referential integrity for transfer legs (PostgreSQL).
-- Applied as NOT VALID so existing tenants with legacy orphan IDs are not blocked at deploy time.
-- After cleaning data, run: ALTER TABLE transactions VALIDATE CONSTRAINT fk_transactions_from_account; (and same for to_account).
-- Idempotent: safe when migrate re-runs all files or constraint already exists.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_transactions_from_account'
      AND conrelid = 'public.transactions'::regclass
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT fk_transactions_from_account
      FOREIGN KEY (from_account_id) REFERENCES accounts(id) ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_transactions_to_account'
      AND conrelid = 'public.transactions'::regclass
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT fk_transactions_to_account
      FOREIGN KEY (to_account_id) REFERENCES accounts(id) ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

COMMENT ON CONSTRAINT fk_transactions_from_account ON transactions IS
  'Transfer source account must exist; validate after backfilling orphan from_account_id values.';
COMMENT ON CONSTRAINT fk_transactions_to_account ON transactions IS
  'Transfer destination account must exist; validate after backfilling orphan to_account_id values.';
