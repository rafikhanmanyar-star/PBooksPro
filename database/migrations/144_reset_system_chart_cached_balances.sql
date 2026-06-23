-- Reset polluted cached balances on shared system chart rows.
-- System account balances are derived per-tenant from journal_lines only (see accountBalanceSql.ts).

UPDATE accounts
SET opening_balance = 0,
    balance = 0,
    updated_at = NOW()
WHERE tenant_id = '__system__'
  AND deleted_at IS NULL
  AND (COALESCE(opening_balance, 0) <> 0 OR COALESCE(balance, 0) <> 0);
