-- Bank/Cash opening balance: amount before in-app transactions; editable separately from running balance.

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(18, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN accounts.opening_balance IS 'Opening amount for Bank/Cash before system transactions; balance = opening_balance + net from transactions.';

-- Backfill tenant-owned Bank/Cash: opening = stored balance minus net effect of transactions (matches applyTransactionEffect).
UPDATE accounts a
SET opening_balance = COALESCE(a.balance, 0) - COALESCE((
  SELECT SUM(
    CASE
      WHEN t.type = 'Income' AND t.account_id = a.id THEN t.amount
      WHEN t.type = 'Expense' AND t.account_id = a.id THEN -t.amount
      WHEN t.type = 'Transfer' AND t.from_account_id = a.id THEN -t.amount
      WHEN t.type = 'Transfer' AND t.to_account_id = a.id THEN t.amount
      WHEN t.type = 'Loan' AND t.account_id = a.id THEN
        CASE WHEN t.subtype IN ('Receive Loan', 'Collect Loan') THEN t.amount ELSE -t.amount END
      ELSE 0
    END
  )
  FROM transactions t
  WHERE t.tenant_id = a.tenant_id AND t.deleted_at IS NULL
), 0)
WHERE a.type IN ('Bank', 'Cash')
  AND a.deleted_at IS NULL
  AND a.tenant_id IS NOT NULL
  AND a.tenant_id <> '__system__';

-- Shared chart rows: keep opening at 0 (balances for those accounts are derived per tenant in API).
UPDATE accounts
SET opening_balance = 0
WHERE tenant_id = '__system__' AND type IN ('Bank', 'Cash');
