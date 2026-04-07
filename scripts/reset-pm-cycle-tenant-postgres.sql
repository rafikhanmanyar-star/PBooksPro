-- =============================================================================
-- PM Cycle data reset for ONE tenant (PostgreSQL)
-- =============================================================================
-- Schema in this app: PM cycle uses table `pm_cycle_allocations` (not pm_bills).
-- PM fee bills are rows in `bills` with bill_number LIKE 'PM-ALLOC-%', linked from
-- pm_cycle_allocations.bill_id. Payments are `transactions` with bill_id and/or
-- batch_id (equity payout pairs share batch_id).
--
-- There are NO pm_transactions / pm_payments tables. investment_allocations is not
-- used for this module. Optional double-entry: journal_entries / journal_lines
-- (source_module = 'transaction', source_id = transactions.id).
--
-- Replace :tenant_id before running, or use \set tenant_id '...' in psql.
--
-- SAFETY: run --dry-run equivalent first (SELECT counts). Take a full DB backup.
-- =============================================================================

\set tenant_id 'rk-builders-284d6d'

BEGIN;

-- -----------------------------------------------------------------------------
-- 0) Preflight counts (inspect; do not rely on alone)
-- -----------------------------------------------------------------------------
-- SELECT COUNT(*) FROM pm_cycle_allocations WHERE tenant_id = :'tenant_id';
-- SELECT COUNT(*) FROM bills WHERE tenant_id = :'tenant_id' AND bill_number LIKE 'PM-ALLOC-%';

-- -----------------------------------------------------------------------------
-- 1) Backup tables (timestamp suffix recommended in real runs; example uses fixed names)
-- -----------------------------------------------------------------------------
-- CREATE TABLE backup_pm_cycle_allocations_20260407 AS
--   SELECT * FROM pm_cycle_allocations WHERE tenant_id = :'tenant_id';
-- CREATE TABLE backup_bills_pm_cycle_20260407 AS
--   SELECT * FROM bills b WHERE tenant_id = :'tenant_id'
--     AND b.id IN (
--       SELECT DISTINCT bill_id FROM pm_cycle_allocations WHERE tenant_id = :'tenant_id' AND bill_id IS NOT NULL
--       UNION
--       SELECT id FROM bills WHERE tenant_id = :'tenant_id' AND bill_number LIKE 'PM-ALLOC-%'
--     );
-- CREATE TABLE backup_transactions_pm_cycle_20260407 AS
--   SELECT t.* FROM transactions t
--   WHERE t.tenant_id = :'tenant_id'
--     AND (
--       t.bill_id IN (SELECT id FROM backup_bills_pm_cycle_20260407)
--       OR (
--         t.batch_id IS NOT NULL
--         AND t.batch_id IN (
--           SELECT DISTINCT batch_id FROM transactions
--           WHERE tenant_id = :'tenant_id' AND bill_id IN (SELECT id FROM backup_bills_pm_cycle_20260407)
--             AND batch_id IS NOT NULL
--         )
--       )
--     );

-- -----------------------------------------------------------------------------
-- 2) Delete order (example — uncomment after backups exist)
-- -----------------------------------------------------------------------------
-- Optional journal (if populated):
-- DELETE FROM journal_reversals WHERE tenant_id = :'tenant_id'
--   AND (original_journal_entry_id IN (SELECT id FROM journal_entries WHERE ...) OR ...);
-- DELETE FROM journal_lines WHERE journal_entry_id IN (...);
-- DELETE FROM journal_entries WHERE tenant_id = :'tenant_id' AND ...;

-- DELETE FROM transactions
-- WHERE tenant_id = :'tenant_id'
--   AND (
--     bill_id IN (SELECT id FROM bills WHERE tenant_id = :'tenant_id' AND bill_number LIKE 'PM-ALLOC-%'
--                  UNION SELECT bill_id FROM pm_cycle_allocations WHERE tenant_id = :'tenant_id' AND bill_id IS NOT NULL)
--     OR batch_id IN (
--       SELECT DISTINCT batch_id FROM transactions t2
--       WHERE t2.tenant_id = :'tenant_id'
--         AND t2.bill_id IN (
--           SELECT id FROM bills WHERE tenant_id = :'tenant_id' AND bill_number LIKE 'PM-ALLOC-%'
--           UNION SELECT bill_id FROM pm_cycle_allocations WHERE tenant_id = :'tenant_id' AND bill_id IS NOT NULL
--         )
--         AND t2.batch_id IS NOT NULL
--     )
--   );

-- DELETE FROM pm_cycle_allocations WHERE tenant_id = :'tenant_id';

-- DELETE FROM bills
-- WHERE tenant_id = :'tenant_id'
--   AND bill_number LIKE 'PM-ALLOC-%';

-- Also delete bills referenced only from allocations (if any not matching PM-ALLOC pattern):
-- DELETE FROM bills WHERE tenant_id = :'tenant_id' AND id IN (
--   SELECT bill_id FROM pm_cycle_allocations WHERE tenant_id = :'tenant_id' AND bill_id IS NOT NULL
-- );
-- (Run allocations DELETE first if you use this variant — prefer Node service for one consistent path.)

ROLLBACK;

-- =============================================================================
-- Consistency checks after COMMIT (run separately)
-- =============================================================================
-- SELECT COUNT(*) AS pm_alloc_remaining FROM pm_cycle_allocations WHERE tenant_id = 'rk-builders-284d6d';
-- SELECT COUNT(*) AS pm_bills_remaining FROM bills WHERE tenant_id = 'rk-builders-284d6d' AND bill_number LIKE 'PM-ALLOC-%';
-- =============================================================================
