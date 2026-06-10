-- Project expense vouchers: use Settings chart-of-accounts expense categories (categories table)
-- instead of separate project_expense_categories mapping table.

-- Backfill tenant expense categories from legacy project_expense_categories names (when not already present).
-- Include soft-deleted legacy rows still referenced by vouchers.
INSERT INTO categories (id, tenant_id, name, type, is_permanent, is_rental, is_hidden, version, created_at, updated_at)
SELECT
  'cat_pev_' || replace(gen_random_uuid()::text, '-', ''),
  pec.tenant_id,
  pec.name,
  'Expense',
  FALSE,
  FALSE,
  FALSE,
  1,
  NOW(),
  NOW()
FROM project_expense_categories pec
WHERE (
  pec.deleted_at IS NULL
  OR EXISTS (
    SELECT 1 FROM project_expense_vouchers v
    WHERE v.expense_category_id = pec.id
  )
)
  AND NOT EXISTS (
    SELECT 1 FROM categories c
    WHERE c.deleted_at IS NULL
      AND c.type = 'Expense'
      AND lower(c.name) = lower(pec.name)
      AND (c.tenant_id = pec.tenant_id OR c.tenant_id = '__system__')
  );

-- Drop legacy FK before repointing vouchers at categories rows (UPDATE would fail otherwise).
ALTER TABLE project_expense_vouchers
  DROP CONSTRAINT IF EXISTS project_expense_vouchers_expense_category_id_fkey;

-- Point existing vouchers at matching Settings categories (tenant row preferred over system).
UPDATE project_expense_vouchers v
SET expense_category_id = sub.new_category_id
FROM (
  SELECT
    v2.id AS voucher_id,
    (
      SELECT c.id
      FROM categories c
      INNER JOIN project_expense_categories pec ON pec.id = v2.expense_category_id
      WHERE c.deleted_at IS NULL
        AND c.type = 'Expense'
        AND lower(c.name) = lower(pec.name)
        AND (c.tenant_id = v2.tenant_id OR c.tenant_id = '__system__')
      ORDER BY CASE WHEN c.tenant_id = v2.tenant_id THEN 0 ELSE 1 END, c.name
      LIMIT 1
    ) AS new_category_id
  FROM project_expense_vouchers v2
  WHERE EXISTS (
    SELECT 1 FROM project_expense_categories pec
    WHERE pec.id = v2.expense_category_id
  )
) sub
WHERE v.id = sub.voucher_id
  AND sub.new_category_id IS NOT NULL;

-- Orphan vouchers (missing legacy category row): per-tenant hidden fallback category.
INSERT INTO categories (id, tenant_id, name, type, is_permanent, is_rental, is_hidden, version, created_at, updated_at)
SELECT
  'cat_pev_legacy_' || replace(gen_random_uuid()::text, '-', ''),
  t.tenant_id,
  'Project Expense (Legacy)',
  'Expense',
  FALSE,
  FALSE,
  TRUE,
  1,
  NOW(),
  NOW()
FROM (
  SELECT DISTINCT v.tenant_id
  FROM project_expense_vouchers v
  WHERE NOT EXISTS (
    SELECT 1 FROM categories c
    WHERE c.id = v.expense_category_id AND c.deleted_at IS NULL
  )
) t
WHERE NOT EXISTS (
  SELECT 1 FROM categories c
  WHERE c.deleted_at IS NULL
    AND c.type = 'Expense'
    AND lower(c.name) = 'project expense (legacy)'
    AND c.tenant_id = t.tenant_id
);

UPDATE project_expense_vouchers v
SET expense_category_id = (
  SELECT c.id
  FROM categories c
  WHERE c.deleted_at IS NULL
    AND c.type = 'Expense'
    AND lower(c.name) = 'project expense (legacy)'
    AND c.tenant_id = v.tenant_id
  LIMIT 1
)
WHERE NOT EXISTS (
  SELECT 1 FROM categories c
  WHERE c.id = v.expense_category_id AND c.deleted_at IS NULL
);

ALTER TABLE project_expense_vouchers
  ADD CONSTRAINT project_expense_vouchers_expense_category_id_fkey
  FOREIGN KEY (expense_category_id) REFERENCES categories(id) ON DELETE RESTRICT;

COMMENT ON COLUMN project_expense_vouchers.expense_category_id IS
  'Settings expense category (chart of accounts categories table).';
