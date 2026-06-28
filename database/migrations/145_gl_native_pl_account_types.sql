-- P0-B Migration 1 — GL-native P&L: extend account type system + per-tenant feature flag.
-- accounts.type is free-form TEXT (no DB enum), so the new types REVENUE, COGS, EXPENSE,
-- OTHER_INCOME, OTHER_EXPENSE require NO column change here — validation is enforced in the
-- application layer (types.ts AccountType + financial-core normalBalanceDirection).
-- This migration only adds the per-tenant rollout flag. Apply with: npm run db:migrate:lan.
--
-- Normal balance (enforced by shared/financial-core/trialBalanceCore.ts normalBalanceDirection):
--   Debit-normal : ASSET, BANK, CASH, EXPENSE, COGS, OTHER_EXPENSE
--   Credit-normal: LIABILITY, EQUITY, REVENUE, OTHER_INCOME

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'tenants' AND column_name = 'gl_native_pl'
  ) THEN
    ALTER TABLE tenants ADD COLUMN gl_native_pl BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

COMMENT ON COLUMN tenants.gl_native_pl IS
  'P0 rollout flag. FALSE = legacy posting (Income/Expense Summary). TRUE = GL-native revenue/expense accounts. Flipped per-tenant by migratePlToGlAccounts after reclassification.';
