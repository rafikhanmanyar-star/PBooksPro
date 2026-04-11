-- Repair rental agreement renewal chains: one Active per property+contact chain (Active/Renewed),
-- link previous_agreement_id, broker_fee only on chronologically first row (max fee promoted to first).
-- Then enforce at most one Active per property (different contacts: loser -> Terminated).
-- Idempotent: only updates rows that differ.

-- Phase 1: chains (Active + Renewed only), per (tenant_id, property_id, contact_id)
WITH lagged AS (
  SELECT
    r.id,
    r.tenant_id,
    CASE
      WHEN ROW_NUMBER() OVER (
        PARTITION BY r.tenant_id, r.property_id, r.contact_id
        ORDER BY r.start_date, r.end_date, r.id
      ) = COUNT(*) OVER (
        PARTITION BY r.tenant_id, r.property_id, r.contact_id
      ) THEN 'Active'
      ELSE 'Renewed'
    END AS new_status,
    LAG(r.id) OVER (
      PARTITION BY r.tenant_id, r.property_id, r.contact_id
      ORDER BY r.start_date, r.end_date, r.id
    ) AS new_prev_id,
    CASE
      WHEN ROW_NUMBER() OVER (
        PARTITION BY r.tenant_id, r.property_id, r.contact_id
        ORDER BY r.start_date, r.end_date, r.id
      ) = 1 THEN MAX(COALESCE(r.broker_fee, 0)) OVER (
        PARTITION BY r.tenant_id, r.property_id, r.contact_id
      )
      ELSE 0
    END AS new_broker_fee
  FROM rental_agreements r
  WHERE r.deleted_at IS NULL
    AND r.status IN ('Active', 'Renewed')
)
UPDATE rental_agreements r
SET
  status = l.new_status,
  previous_agreement_id = l.new_prev_id,
  broker_fee = NULLIF(l.new_broker_fee, 0),
  version = r.version + 1,
  updated_at = NOW()
FROM lagged l
WHERE r.id = l.id
  AND r.tenant_id = l.tenant_id
  AND (
    r.status IS DISTINCT FROM l.new_status
    OR r.previous_agreement_id IS DISTINCT FROM l.new_prev_id
    OR COALESCE(r.broker_fee, 0) IS DISTINCT FROM COALESCE(NULLIF(l.new_broker_fee, 0), 0)
  );

-- Phase 2: at most one Active per (tenant_id, property_id)
WITH multi AS (
  SELECT tenant_id, property_id
  FROM rental_agreements
  WHERE deleted_at IS NULL AND status = 'Active'
  GROUP BY tenant_id, property_id
  HAVING COUNT(*) > 1
),
winners AS (
  SELECT DISTINCT ON (r.tenant_id, r.property_id)
    r.tenant_id,
    r.property_id,
    r.id AS winner_id,
    r.contact_id AS winner_contact_id
  FROM rental_agreements r
  INNER JOIN multi m ON m.tenant_id = r.tenant_id AND m.property_id = r.property_id
  WHERE r.deleted_at IS NULL AND r.status = 'Active'
  ORDER BY r.tenant_id, r.property_id, r.end_date DESC, r.start_date DESC, r.id DESC
)
UPDATE rental_agreements r
SET
  status = CASE
    WHEN r.contact_id = w.winner_contact_id THEN 'Renewed'
    ELSE 'Terminated'
  END,
  version = r.version + 1,
  updated_at = NOW()
FROM winners w
WHERE r.tenant_id = w.tenant_id
  AND r.property_id = w.property_id
  AND r.status = 'Active'
  AND r.id <> w.winner_id;
