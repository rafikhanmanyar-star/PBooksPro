-- GL financial dimensions: building_id on journal headers/lines, cost_center_id on lines.
-- IDs use TEXT (matches projects/buildings PKs and existing journal_lines.project_id).

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS building_id TEXT;

ALTER TABLE journal_lines
  ADD COLUMN IF NOT EXISTS building_id TEXT;

ALTER TABLE journal_lines
  ADD COLUMN IF NOT EXISTS cost_center_id TEXT;

CREATE INDEX IF NOT EXISTS idx_journal_entries_building
  ON journal_entries (building_id)
  WHERE building_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journal_lines_building
  ON journal_lines (building_id)
  WHERE building_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journal_lines_project
  ON journal_lines (project_id)
  WHERE project_id IS NOT NULL;

COMMENT ON COLUMN journal_entries.building_id IS 'Building scope for GL entry header; propagated from source document.';
COMMENT ON COLUMN journal_lines.building_id IS 'Building scope on GL line; defaults from entry/source at posting time.';
COMMENT ON COLUMN journal_lines.cost_center_id IS 'Optional cost center scope (future payroll/overhead allocation).';

-- Bootstrapped LAN DBs may have 062 marked applied without trigger DDL; ensure triggers exist.
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

-- Historical backfill (journal tables are immutable; disable update triggers briefly).
ALTER TABLE journal_entries DISABLE TRIGGER journal_entries_immutable_upd;
ALTER TABLE journal_lines DISABLE TRIGGER journal_lines_immutable_upd;

UPDATE journal_entries je
SET
  building_id = COALESCE(
    NULLIF(TRIM(je.building_id), ''),
    NULLIF(TRIM(t.building_id), '')
  ),
  project_id = COALESCE(
    NULLIF(TRIM(je.project_id), ''),
    NULLIF(TRIM(t.project_id), '')
  )
FROM transactions t
WHERE je.source_module = 'transaction'
  AND je.source_id = t.id
  AND t.deleted_at IS NULL;

UPDATE journal_entries je
SET
  building_id = COALESCE(
    NULLIF(TRIM(je.building_id), ''),
    NULLIF(TRIM(i.building_id), ''),
    NULLIF(TRIM(p.building_id), '')
  ),
  project_id = COALESCE(
    NULLIF(TRIM(je.project_id), ''),
    NULLIF(TRIM(i.project_id), '')
  )
FROM invoices i
LEFT JOIN properties p ON p.id = i.property_id AND p.tenant_id = i.tenant_id AND p.deleted_at IS NULL
WHERE je.source_module = 'invoice'
  AND je.source_id = i.id
  AND i.deleted_at IS NULL;

UPDATE journal_entries je
SET
  building_id = COALESCE(
    NULLIF(TRIM(je.building_id), ''),
    NULLIF(TRIM(b.building_id), ''),
    NULLIF(TRIM(p.building_id), '')
  ),
  project_id = COALESCE(
    NULLIF(TRIM(je.project_id), ''),
    NULLIF(TRIM(b.project_id), '')
  )
FROM bills b
LEFT JOIN properties p ON p.id = b.property_id AND p.tenant_id = b.tenant_id AND p.deleted_at IS NULL
WHERE je.source_module = 'bill'
  AND je.source_id = b.id
  AND b.deleted_at IS NULL;

UPDATE journal_entries je
SET
  building_id = COALESCE(
    NULLIF(TRIM(je.building_id), ''),
    NULLIF(TRIM(b.building_id), ''),
    NULLIF(TRIM(p.building_id), '')
  ),
  project_id = COALESCE(
    NULLIF(TRIM(je.project_id), ''),
    NULLIF(TRIM(b.project_id), '')
  )
FROM bills b
LEFT JOIN properties p ON p.id = b.property_id AND p.tenant_id = b.tenant_id AND p.deleted_at IS NULL
WHERE je.source_module = 'vendor_bill_advance_clearing'
  AND je.source_id = b.id
  AND b.deleted_at IS NULL;

UPDATE journal_lines jl
SET
  building_id = COALESCE(NULLIF(TRIM(jl.building_id), ''), NULLIF(TRIM(je.building_id), '')),
  project_id = COALESCE(NULLIF(TRIM(jl.project_id), ''), NULLIF(TRIM(je.project_id), ''))
FROM journal_entries je
WHERE jl.journal_entry_id = je.id;

ALTER TABLE journal_entries ENABLE TRIGGER journal_entries_immutable_upd;
ALTER TABLE journal_lines ENABLE TRIGGER journal_lines_immutable_upd;
