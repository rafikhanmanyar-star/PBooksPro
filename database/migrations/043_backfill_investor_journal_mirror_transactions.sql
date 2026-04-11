-- Backfill app `transactions` rows for investor contributions/withdrawals that were posted to the GL
-- (journal_entries / journal_lines) before the API began mirroring into `transactions`.
-- Idempotent: skips any journal entry that already has id = 'invj_tx_' || journal_entries.id.

-- Contributions: journal Dr cash / Cr equity → mirror Transfer equity_investment (from equity → to cash), same as app.
INSERT INTO transactions (
  id,
  tenant_id,
  user_id,
  type,
  subtype,
  amount,
  date,
  description,
  reference,
  account_id,
  from_account_id,
  to_account_id,
  project_id,
  is_system,
  version,
  deleted_at,
  created_at,
  updated_at
)
SELECT
  'invj_tx_' || je.id,
  je.tenant_id,
  je.created_by,
  'Transfer',
  'equity_investment',
  legs.d_amt,
  je.entry_date,
  COALESCE(je.description, 'Investor contribution'),
  CASE
    WHEN je.reference IS NULL OR TRIM(je.reference) = '' THEN 'JE:' || je.id
    ELSE je.reference
  END,
  legs.eq_acc,
  legs.eq_acc,
  legs.cash_acc,
  COALESCE(
    je.project_id,
    (SELECT jl.project_id FROM journal_lines jl WHERE jl.journal_entry_id = je.id AND jl.credit_amount > 0 LIMIT 1),
    (SELECT jl.project_id FROM journal_lines jl WHERE jl.journal_entry_id = je.id AND jl.debit_amount > 0 LIMIT 1)
  ),
  TRUE,
  1,
  NULL,
  je.created_at,
  NOW()
FROM journal_entries je
CROSS JOIN LATERAL (
  SELECT
    (SELECT jl.account_id FROM journal_lines jl WHERE jl.journal_entry_id = je.id AND jl.debit_amount > 0 LIMIT 1) AS cash_acc,
    (SELECT jl.account_id FROM journal_lines jl WHERE jl.journal_entry_id = je.id AND jl.credit_amount > 0 LIMIT 1) AS eq_acc,
    (SELECT jl.debit_amount FROM journal_lines jl WHERE jl.journal_entry_id = je.id AND jl.debit_amount > 0 LIMIT 1) AS d_amt
) AS legs
WHERE je.investor_transaction_type = 'investment'
  AND (SELECT COUNT(*)::int FROM journal_lines jl WHERE jl.journal_entry_id = je.id) = 2
  AND legs.cash_acc IS NOT NULL
  AND legs.eq_acc IS NOT NULL
  AND legs.cash_acc <> legs.eq_acc
  AND legs.d_amt IS NOT NULL
  AND legs.d_amt > 0
  AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.id = 'invj_tx_' || je.id);

-- Withdrawals: journal Dr equity / Cr cash → mirror Transfer equity_withdrawal (from cash → to equity), same as app.
INSERT INTO transactions (
  id,
  tenant_id,
  user_id,
  type,
  subtype,
  amount,
  date,
  description,
  reference,
  account_id,
  from_account_id,
  to_account_id,
  project_id,
  is_system,
  version,
  deleted_at,
  created_at,
  updated_at
)
SELECT
  'invj_tx_' || je.id,
  je.tenant_id,
  je.created_by,
  'Transfer',
  'equity_withdrawal',
  legs.d_amt,
  je.entry_date,
  COALESCE(je.description, 'Investor withdrawal'),
  CASE
    WHEN je.reference IS NULL OR TRIM(je.reference) = '' THEN 'JE:' || je.id
    ELSE je.reference
  END,
  legs.eq_acc,
  legs.cash_acc,
  legs.eq_acc,
  COALESCE(
    je.project_id,
    (SELECT jl.project_id FROM journal_lines jl WHERE jl.journal_entry_id = je.id AND jl.debit_amount > 0 LIMIT 1),
    (SELECT jl.project_id FROM journal_lines jl WHERE jl.journal_entry_id = je.id AND jl.credit_amount > 0 LIMIT 1)
  ),
  TRUE,
  1,
  NULL,
  je.created_at,
  NOW()
FROM journal_entries je
CROSS JOIN LATERAL (
  SELECT
    (SELECT jl.account_id FROM journal_lines jl WHERE jl.journal_entry_id = je.id AND jl.debit_amount > 0 LIMIT 1) AS eq_acc,
    (SELECT jl.account_id FROM journal_lines jl WHERE jl.journal_entry_id = je.id AND jl.credit_amount > 0 LIMIT 1) AS cash_acc,
    (SELECT jl.debit_amount FROM journal_lines jl WHERE jl.journal_entry_id = je.id AND jl.debit_amount > 0 LIMIT 1) AS d_amt
) AS legs
WHERE je.investor_transaction_type = 'withdrawal'
  AND (SELECT COUNT(*)::int FROM journal_lines jl WHERE jl.journal_entry_id = je.id) = 2
  AND legs.cash_acc IS NOT NULL
  AND legs.eq_acc IS NOT NULL
  AND legs.cash_acc <> legs.eq_acc
  AND legs.d_amt IS NOT NULL
  AND legs.d_amt > 0
  AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.id = 'invj_tx_' || je.id);
