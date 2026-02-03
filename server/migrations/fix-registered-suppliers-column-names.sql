-- Fix registered_suppliers: ensure required columns exist (fixes "column supplier_name does not exist")
-- Run this ONCE on the same PostgreSQL database your app uses (DBeaver: open file -> Execute SQL; psql: psql -U user -d dbname -f this-file.sql)
--
-- 1) Rename wrong-case columns if they exist (e.g. "Supplier_name" -> supplier_name)
-- 2) Add columns if missing (older DBs may not have supplier_* columns)

-- Step 1: Rename wrong-case to lowercase
DO $$ BEGIN
  ALTER TABLE registered_suppliers RENAME COLUMN "Supplier_name" TO supplier_name;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE registered_suppliers RENAME COLUMN "Supplier_company" TO supplier_company;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE registered_suppliers RENAME COLUMN "Supplier_contact_no" TO supplier_contact_no;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE registered_suppliers RENAME COLUMN "Supplier_address" TO supplier_address;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE registered_suppliers RENAME COLUMN "Supplier_description" TO supplier_description;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- Step 2: Add columns if they don't exist (PostgreSQL 9.5+)
ALTER TABLE registered_suppliers ADD COLUMN IF NOT EXISTS supplier_name TEXT;
ALTER TABLE registered_suppliers ADD COLUMN IF NOT EXISTS supplier_company TEXT;
ALTER TABLE registered_suppliers ADD COLUMN IF NOT EXISTS supplier_contact_no TEXT;
ALTER TABLE registered_suppliers ADD COLUMN IF NOT EXISTS supplier_address TEXT;
ALTER TABLE registered_suppliers ADD COLUMN IF NOT EXISTS supplier_description TEXT;
