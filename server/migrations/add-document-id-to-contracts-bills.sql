-- Migration: Add document_id to contracts and bills
-- Documents are stored in the documents table and linked by document_id for local + cloud sync and role-based access.

-- Add document_id to bills (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bills' AND column_name = 'document_id'
  ) THEN
    ALTER TABLE bills ADD COLUMN document_id TEXT;
    ALTER TABLE bills ADD CONSTRAINT bills_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_bills_document_id ON bills(document_id);
  END IF;
END $$;

-- Add document_id to contracts (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'document_id'
  ) THEN
    ALTER TABLE contracts ADD COLUMN document_id TEXT;
    ALTER TABLE contracts ADD CONSTRAINT contracts_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_contracts_document_id ON contracts(document_id);
  END IF;
END $$;

-- Ensure FK constraints exist (for new DBs where schema added column without FK)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bills_document_id_fkey') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bills' AND column_name = 'document_id') THEN
    ALTER TABLE bills ADD CONSTRAINT bills_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_document_id_fkey') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'document_id') THEN
    ALTER TABLE contracts ADD CONSTRAINT contracts_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;
  END IF;
END $$;
