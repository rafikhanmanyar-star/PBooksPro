-- Backfill transactions.category_id from bills for bill payment rows (rental + project bills).
-- Fixes uncategorized expense in reports when the bill had a category but payment rows did not.
-- Safe to re-run: only updates Expense rows with null/empty category_id.

UPDATE transactions t
SET category_id = b.category_id, updated_at = NOW()
FROM bills b
WHERE t.tenant_id = b.tenant_id
  AND t.bill_id = b.id
  AND t.type = 'Expense'
  AND t.deleted_at IS NULL
  AND b.deleted_at IS NULL
  AND b.category_id IS NOT NULL AND trim(b.category_id::text) != ''
  AND (t.category_id IS NULL OR trim(t.category_id::text) = '');
