-- Separate marketing plan revision from LWW sync version on installment_plans.
-- Previously the frontend "version" (plan revision within a root_id chain) collided with
-- the row version used for optimistic concurrency, causing wrong "latest plan" selection
-- after re-login and failed API sync on approval/conversion.

ALTER TABLE installment_plans
  ADD COLUMN IF NOT EXISTS plan_revision INTEGER NOT NULL DEFAULT 1;

-- Backfill revision numbers within each root chain (oldest = 1).
WITH ranked AS (
  SELECT
    id,
    tenant_id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, COALESCE(root_id, id)
      ORDER BY created_at ASC, id ASC
    ) AS rev
  FROM installment_plans
)
UPDATE installment_plans ip
SET plan_revision = ranked.rev
FROM ranked
WHERE ip.id = ranked.id
  AND ip.tenant_id = ranked.tenant_id;
