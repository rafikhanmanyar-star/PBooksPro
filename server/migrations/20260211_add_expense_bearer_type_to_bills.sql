-- Migration: Add expense_bearer_type to bills for rental maintenance expense recording
-- Date: 2026-02-11
-- Values: 'owner' | 'building' | 'tenant'

ALTER TABLE bills ADD COLUMN IF NOT EXISTS expense_bearer_type TEXT;

-- Backfill from existing logic:
-- projectAgreementId (rental agreement) -> tenant
-- propertyId (without projectAgreementId) -> owner
-- buildingId only -> building
UPDATE bills b
SET expense_bearer_type = CASE
  WHEN b.project_agreement_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM rental_agreements ra WHERE ra.id = b.project_agreement_id)
  THEN 'tenant'
  WHEN b.property_id IS NOT NULL THEN 'owner'
  WHEN b.building_id IS NOT NULL THEN 'building'
  ELSE 'building'
END
WHERE b.expense_bearer_type IS NULL;
