-- =============================================================================
-- One-off repair: renumber duplicate PM-ALLOC-* bill numbers per tenant
-- =============================================================================
-- Problem: multiple bills shared the same bill_number (e.g. PM-ALLOC-00002).
-- Fix: keep the first row per (tenant_id, bill_number) by issue_date, id;
--      assign PM-ALLOC-NNNNN to the rest using the next free sequence numbers.
--
-- Safe for: transactions use bill_id, not bill_number — no change needed there.
-- Optional: search descriptions for old "Bill #PM-ALLOC-..." text and update manually.
--
-- BACK UP YOUR DATABASE FIRST.
-- Replace :tenant_id below (or use the session variable in the Postgres block).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Inspect duplicates (run before repair; expect 0 rows after repair)
-- -----------------------------------------------------------------------------
-- PostgreSQL:
-- SELECT tenant_id, bill_number, COUNT(*) AS n
-- FROM bills
-- WHERE deleted_at IS NULL AND bill_number LIKE 'PM-ALLOC-%'
-- GROUP BY tenant_id, bill_number
-- HAVING COUNT(*) > 1;

-- SQLite:
-- SELECT tenant_id, bill_number, COUNT(*) AS n
-- FROM bills
-- WHERE deleted_at IS NULL AND bill_number LIKE 'PM-ALLOC-%'
-- GROUP BY tenant_id, bill_number
-- HAVING COUNT(*) > 1;


-- =============================================================================
-- PostgreSQL
-- =============================================================================
-- Usage: set tenant once, then run the UPDATE block in a transaction.

-- \set tenant_id 'YOUR_TENANT_UUID_HERE'
-- Or use literal in the CTEs below.

BEGIN;

WITH maxseq AS (
  SELECT COALESCE(MAX(
    (regexp_match(bill_number, '^PM-ALLOC-(\d+)$'))[1]::int
  ), 0) AS m
  FROM bills
  WHERE deleted_at IS NULL
    AND tenant_id = 'REPLACE_WITH_TENANT_ID'
    AND bill_number ~ '^PM-ALLOC-[0-9]+$'
),
ranked AS (
  SELECT
    id,
    issue_date,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, bill_number
      ORDER BY issue_date, id
    ) AS rn
  FROM bills
  WHERE deleted_at IS NULL
    AND tenant_id = 'REPLACE_WITH_TENANT_ID'
    AND bill_number LIKE 'PM-ALLOC-%'
),
to_renumber AS (
  SELECT
    r.id,
    ROW_NUMBER() OVER (ORDER BY r.issue_date, r.id) AS ord
  FROM ranked r
  WHERE r.rn > 1
)
UPDATE bills b
SET
  bill_number = 'PM-ALLOC-' || LPAD((m.m + t.ord)::text, 5, '0'),
  updated_at = NOW()
FROM to_renumber t
CROSS JOIN maxseq m
WHERE b.id = t.id;

COMMIT;


-- =============================================================================
-- SQLite (Electron local DB, sql.js, etc.)
-- =============================================================================
-- Replace 'REPLACE_WITH_TENANT_ID' with your tenant id string.

BEGIN;

WITH maxseq AS (
  SELECT COALESCE(MAX(CAST(SUBSTR(bill_number, 10) AS INTEGER)), 0) AS m
  FROM bills
  WHERE deleted_at IS NULL
    AND tenant_id = 'REPLACE_WITH_TENANT_ID'
    AND bill_number LIKE 'PM-ALLOC-%'
    AND SUBSTR(bill_number, 1, 9) = 'PM-ALLOC-'
    AND LENGTH(bill_number) > 9
),
ranked AS (
  SELECT
    id,
    issue_date,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, bill_number
      ORDER BY issue_date, id
    ) AS rn
  FROM bills
  WHERE deleted_at IS NULL
    AND tenant_id = 'REPLACE_WITH_TENANT_ID'
    AND bill_number LIKE 'PM-ALLOC-%'
),
to_renumber AS (
  SELECT
    r.id,
    ROW_NUMBER() OVER (ORDER BY r.issue_date, r.id) AS ord
  FROM ranked r
  WHERE r.rn > 1
)
UPDATE bills
SET
  bill_number = 'PM-ALLOC-' || printf('%05d', (SELECT m FROM maxseq) + to_renumber.ord),
  updated_at = datetime('now')
FROM to_renumber
WHERE bills.id = to_renumber.id;

COMMIT;
