/**
 * Account balance expressions for list/get queries.
 * Journal lines are the sole GL source of truth (ledger unification).
 */

/** Correlated subquery: signed balance from journal_lines for account `a`. */
export const JOURNAL_SIGNED_BALANCE_SUBQUERY = `(
  SELECT COALESCE(SUM(
    CASE
      WHEN LOWER(a.type) IN ('asset', 'expense', 'bank', 'cash') THEN (jl.debit_amount - jl.credit_amount)
      ELSE (jl.credit_amount - jl.debit_amount)
    END
  ), 0)
  FROM journal_lines jl
  INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.account_id = a.id AND je.tenant_id = $1
)`;

/** Correlated subquery: signed balance from transactions for account `a`. */
export const TRANSACTION_SIGNED_BALANCE_SUBQUERY = `(
  SELECT COALESCE(SUM(
    CASE
      WHEN t.type = 'Income' AND t.account_id = a.id THEN t.amount
      WHEN t.type = 'Expense' AND t.account_id = a.id THEN -t.amount
      WHEN t.type = 'Transfer' AND t.from_account_id = a.id THEN -t.amount
      WHEN t.type = 'Transfer' AND t.to_account_id = a.id THEN t.amount
      WHEN t.type = 'Loan' AND t.account_id = a.id THEN
        CASE WHEN t.subtype IN ('Receive Loan', 'Collect Loan') THEN t.amount ELSE -t.amount END
      ELSE 0
    END
  ), 0)
  FROM transactions t
  WHERE t.tenant_id = $1 AND t.deleted_at IS NULL
)`;

/** $1 = tenantId for list queries; $2 = GLOBAL_SYSTEM_TENANT_ID; account alias must be `a`. */
/** Shared chart rows (`tenant_id = $2`) must not use global opening_balance — journal is scoped per tenant. */
export const ACCOUNT_BALANCE_CASE = `CASE WHEN a.tenant_id = $2 THEN ${JOURNAL_SIGNED_BALANCE_SUBQUERY} ELSE COALESCE(a.opening_balance, 0) + ${JOURNAL_SIGNED_BALANCE_SUBQUERY} END`;

/** $1 = account id, $2 = tenantId, $3 = GLOBAL_SYSTEM_TENANT_ID for get-by-id queries. */
export const ACCOUNT_BALANCE_CASE_BY_ID = `CASE WHEN a.tenant_id = $3 THEN (
    SELECT COALESCE(SUM(
      CASE
        WHEN LOWER(a.type) IN ('asset', 'expense', 'bank', 'cash') THEN (jl.debit_amount - jl.credit_amount)
        ELSE (jl.credit_amount - jl.debit_amount)
      END
    ), 0)
    FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.account_id = a.id AND je.tenant_id = $2
  ) ELSE COALESCE(a.opening_balance, 0) + (
    SELECT COALESCE(SUM(
      CASE
        WHEN LOWER(a.type) IN ('asset', 'expense', 'bank', 'cash') THEN (jl.debit_amount - jl.credit_amount)
        ELSE (jl.credit_amount - jl.debit_amount)
      END
    ), 0)
    FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.account_id = a.id AND je.tenant_id = $2
  ) END`;
