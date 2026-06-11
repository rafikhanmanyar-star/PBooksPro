-- Architecture v2 Phase 3: retire legacy documents table mutations.
-- Run backfill (Phase 2) on all tenants BEFORE applying this migration when possible.
-- Backfill may still soft-delete legacy rows via session flag pbooks.documents_backfill=1.

COMMENT ON TABLE documents IS
  'DEPRECATED (v2 Phase 3): use document_metadata. Retained for historical rows; mutations blocked by trigger.';

CREATE OR REPLACE FUNCTION reject_documents_table_mutations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allow Phase 2 backfill to soft-delete legacy rows after metadata insert.
  IF TG_OP = 'UPDATE'
     AND current_setting('pbooks.documents_backfill', true) = '1'
     AND OLD.deleted_at IS NULL
     AND NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'documents table is deprecated; use document_metadata via DocumentsModuleService (Architecture v2 Phase 3)';
END;
$$;

DROP TRIGGER IF EXISTS trg_documents_reject_mutations ON documents;

CREATE TRIGGER trg_documents_reject_mutations
  BEFORE INSERT OR UPDATE OR DELETE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION reject_documents_table_mutations();

COMMENT ON FUNCTION reject_documents_table_mutations() IS
  'Blocks writes to legacy documents table; backfill soft-delete allowed with pbooks.documents_backfill=1';
