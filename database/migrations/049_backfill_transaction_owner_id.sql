-- Backfill owner_id on transactions that have a property_id but no owner_id.
-- Uses property_ownership date ranges to find the owner at the time of each transaction.
-- Falls back to properties.owner_id (current owner) when no ownership row matches.

UPDATE transactions t
SET owner_id = COALESCE(
    (
        SELECT po.owner_id
        FROM property_ownership po
        WHERE po.property_id = t.property_id
          AND po.deleted_at IS NULL
          AND t.date >= po.start_date
          AND (po.end_date IS NULL OR t.date <= po.end_date)
        ORDER BY po.ownership_percentage DESC
        LIMIT 1
    ),
    (
        SELECT p.owner_id
        FROM properties p
        WHERE p.id = t.property_id
    )
),
updated_at = NOW()
WHERE t.owner_id IS NULL
  AND t.property_id IS NOT NULL
  AND t.deleted_at IS NULL;

-- Also add an index for efficient owner-scoped queries
CREATE INDEX IF NOT EXISTS idx_transactions_owner_id
  ON transactions(tenant_id, owner_id)
  WHERE deleted_at IS NULL AND owner_id IS NOT NULL;
