-- Architecture v2 Phase 1: align document_metadata with legacy documents API fields + inline fallback.

ALTER TABLE document_metadata ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE document_metadata ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE document_metadata ADD COLUMN IF NOT EXISTS inline_data BYTEA;

UPDATE document_metadata SET name = file_name WHERE name IS NULL;
UPDATE document_metadata SET type = entity_type WHERE type IS NULL;

COMMENT ON COLUMN document_metadata.inline_data IS 'Dev/local fallback when R2 is not configured; null when bytes are in object storage';
