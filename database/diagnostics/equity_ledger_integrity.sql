-- PBooks Pro — equity / investment ledger integrity checks (PostgreSQL).
-- Run manually against your tenant DB after connecting with psql or your SQL client.
-- Replace :tenant_id if you filter by tenant.

-- 1) Transfer rows referencing missing accounts (would fail when FK is VALIDATED)
SELECT t.id, t.tenant_id, t.date, t.type, t.from_account_id, t.to_account_id, t.description
FROM transactions t
LEFT JOIN accounts af ON af.id = t.from_account_id AND af.tenant_id = t.tenant_id
LEFT JOIN accounts ato ON ato.id = t.to_account_id AND ato.tenant_id = t.tenant_id
WHERE t.deleted_at IS NULL
  AND t.type = 'Transfer'
  AND (
    (t.from_account_id IS NOT NULL AND t.from_account_id <> '' AND af.id IS NULL)
    OR (t.to_account_id IS NOT NULL AND t.to_account_id <> '' AND ato.id IS NULL)
  );

-- 2) Equity transfers where from/to are both non-null but same (suspicious; usually a data entry bug)
SELECT id, tenant_id, date, amount, from_account_id, to_account_id, description
FROM transactions
WHERE deleted_at IS NULL
  AND type = 'Transfer'
  AND from_account_id IS NOT NULL
  AND to_account_id IS NOT NULL
  AND from_account_id = to_account_id;

-- 3) Profit / equity subtypes (after app upgrade) — optional distribution check
SELECT subtype, COUNT(*) AS n
FROM transactions
WHERE deleted_at IS NULL AND subtype LIKE 'equity_%'
GROUP BY subtype
ORDER BY n DESC;
