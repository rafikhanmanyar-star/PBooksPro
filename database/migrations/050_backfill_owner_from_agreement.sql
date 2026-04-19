-- Fix owner_id on invoice-linked transactions to use the agreement's owner_id.
-- After a property transfer, old agreements store the previous owner.
-- Rental income paid under the old agreement belongs to that owner,
-- even if the payment happened after the transfer date.

-- Pass 1: stamp from rental_agreements.owner_id via invoices.agreement_id
UPDATE transactions t
SET owner_id = ra.owner_id,
    updated_at = NOW()
FROM invoices i
JOIN rental_agreements ra ON ra.id = i.agreement_id
WHERE t.invoice_id = i.id
  AND t.property_id IS NOT NULL
  AND t.deleted_at IS NULL
  AND i.deleted_at IS NULL
  AND ra.owner_id IS NOT NULL
  AND ra.owner_id <> ''
  AND (t.owner_id IS NULL OR t.owner_id <> ra.owner_id)
  AND t.tenant_id = i.tenant_id
  AND i.tenant_id = ra.tenant_id;

-- Pass 2: for invoice-linked transactions still without owner_id,
-- resolve from property_ownership using the invoice issue date.
UPDATE transactions t
SET owner_id = COALESCE(
    (
        SELECT po.owner_id
        FROM property_ownership po
        WHERE po.property_id = t.property_id
          AND po.deleted_at IS NULL
          AND i.issue_date >= po.start_date
          AND (po.end_date IS NULL OR i.issue_date <= po.end_date)
        ORDER BY po.ownership_percentage DESC
        LIMIT 1
    ),
    t.owner_id
),
updated_at = NOW()
FROM invoices i
WHERE t.invoice_id = i.id
  AND t.owner_id IS NULL
  AND t.property_id IS NOT NULL
  AND t.deleted_at IS NULL
  AND i.deleted_at IS NULL
  AND i.issue_date IS NOT NULL
  AND t.tenant_id = i.tenant_id;
