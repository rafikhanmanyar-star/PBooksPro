-- Journal immutability on PostgreSQL (parity with electron/schema.sql SQLite triggers).
-- Posted journal entries and lines must not be edited or deleted; use reversing entries instead.

CREATE OR REPLACE FUNCTION deny_journal_entries_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'journal_entries are immutable';
END;
$$;

CREATE OR REPLACE FUNCTION deny_journal_lines_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'journal_lines are immutable';
END;
$$;

DROP TRIGGER IF EXISTS journal_entries_immutable_upd ON journal_entries;
CREATE TRIGGER journal_entries_immutable_upd
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW
  EXECUTE PROCEDURE deny_journal_entries_mutation();

DROP TRIGGER IF EXISTS journal_entries_immutable_del ON journal_entries;
CREATE TRIGGER journal_entries_immutable_del
  BEFORE DELETE ON journal_entries
  FOR EACH ROW
  EXECUTE PROCEDURE deny_journal_entries_mutation();

DROP TRIGGER IF EXISTS journal_lines_immutable_upd ON journal_lines;
CREATE TRIGGER journal_lines_immutable_upd
  BEFORE UPDATE ON journal_lines
  FOR EACH ROW
  EXECUTE PROCEDURE deny_journal_lines_mutation();

DROP TRIGGER IF EXISTS journal_lines_immutable_del ON journal_lines;
CREATE TRIGGER journal_lines_immutable_del
  BEFORE DELETE ON journal_lines
  FOR EACH ROW
  EXECUTE PROCEDURE deny_journal_lines_mutation();
