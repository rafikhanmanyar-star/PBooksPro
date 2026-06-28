-- P0-B Migration 6 — Enforce double-entry at the database.
-- A DEFERRABLE INITIALLY DEFERRED constraint trigger checks SUM(debit) = SUM(credit) per
-- journal_entry at COMMIT, so multi-line inserts within one transaction are validated as a unit.
-- Historical entries are NOT re-validated (trigger fires only on rows written after creation).
-- Apply with: npm run db:migrate:lan.

-- 1) Validate-first: surface any pre-existing unbalanced entries (does not block; clean up via
--    backend/src/scripts/checkJournalBalances.ts before flipping gl_native_pl on a tenant).
DO $$
DECLARE
  bad_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO bad_count FROM (
    SELECT jl.journal_entry_id
    FROM journal_lines jl
    GROUP BY jl.journal_entry_id
    HAVING ABS(COALESCE(SUM(jl.debit_amount), 0) - COALESCE(SUM(jl.credit_amount), 0)) >= 0.005
  ) t;
  IF bad_count > 0 THEN
    RAISE WARNING 'P0-B: % pre-existing unbalanced journal entries detected. They remain valid (trigger only checks new writes); reconcile before enabling gl_native_pl.', bad_count;
  END IF;
END $$;

-- 2) Constraint function: validate the affected entry's balance.
CREATE OR REPLACE FUNCTION assert_journal_entry_balanced() RETURNS TRIGGER AS $$
DECLARE
  target_entry TEXT;
  net NUMERIC(18,2);
BEGIN
  target_entry := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
  IF target_entry IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(debit_amount), 0) - COALESCE(SUM(credit_amount), 0)
    INTO net
  FROM journal_lines
  WHERE journal_entry_id = target_entry;

  -- Entry fully deleted (no lines) is allowed; only non-empty entries must balance.
  IF net IS NOT NULL AND ABS(net) >= 0.005 THEN
    RAISE EXCEPTION 'Journal entry % is unbalanced by % (debits must equal credits).', target_entry, net;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 3) Deferred constraint trigger (idempotent create).
DROP TRIGGER IF EXISTS journal_lines_balanced_check ON journal_lines;
CREATE CONSTRAINT TRIGGER journal_lines_balanced_check
  AFTER INSERT OR UPDATE OR DELETE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION assert_journal_entry_balanced();

COMMENT ON FUNCTION assert_journal_entry_balanced() IS
  'P0-B double-entry guard: per journal_entry, SUM(debit)=SUM(credit) within tolerance 0.005, checked at COMMIT.';
