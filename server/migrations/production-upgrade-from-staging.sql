-- Production upgrade: add missing tables/columns from STAGING
-- Generated: 2026-02-12T12:41:17.571Z
-- Additive only. Idempotent. Safe to re-run.

BEGIN;

-- ========== MISSING COLUMNS (add to production) ==========
-- No schema changes needed; production matches staging.
COMMIT;

-- End of migration.