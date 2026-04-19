-- Per-segment metadata for property ownership transfers.
-- Idempotent: backend migrate reapplies all files in this folder each run.

DO $m$
BEGIN
  ALTER TABLE property_ownership ADD COLUMN transfer_document TEXT;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END
$m$;

DO $m$
BEGIN
  ALTER TABLE property_ownership ADD COLUMN notes TEXT;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END
$m$;
