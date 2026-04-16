-- Repair rental agreements where contact_id was never set (e.g. old property-transfer bug
-- sent tenant id in the wrong JSON field). Copy tenant contact from previous_agreement_id.
-- Idempotent: safe to re-run.

UPDATE rental_agreements AS r
SET contact_id = p.contact_id,
    version = r.version + 1,
    updated_at = NOW()
FROM rental_agreements AS p
WHERE r.tenant_id = p.tenant_id
  AND r.deleted_at IS NULL
  AND p.deleted_at IS NULL
  AND r.previous_agreement_id IS NOT NULL
  AND r.previous_agreement_id = p.id
  AND TRIM(COALESCE(r.contact_id, '')) = ''
  AND TRIM(COALESCE(p.contact_id, '')) <> '';
