-- Migration: Complete Vendor Separation and Data Migration
-- Date: 2026-02-08
-- Description: Migrates contacts of type 'Vendor' to the 'vendors' table and updates all references.

BEGIN;

-- 1. Ensure vendors table exists with correct schema
CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    contact_no TEXT,
    company_name TEXT,
    address TEXT,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    user_id TEXT REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. Add vendor_id columns to referencing tables if they don't exist
DO $$ 
BEGIN
    -- Bills
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bills' AND column_name='vendor_id') THEN
        ALTER TABLE bills ADD COLUMN vendor_id TEXT REFERENCES vendors(id);
    END IF;
    
    -- Make contact_id nullable in bills since it might be a vendor bill now using vendor_id
    ALTER TABLE bills ALTER COLUMN contact_id DROP NOT NULL;

    -- Transactions
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='vendor_id') THEN
        ALTER TABLE transactions ADD COLUMN vendor_id TEXT REFERENCES vendors(id);
    END IF;
END $$;

-- 3. Migrate data from contacts to vendors
-- We use ON CONFLICT DO NOTHING to avoid errors if some were already migrated
INSERT INTO vendors (id, tenant_id, name, contact_no, company_name, address, description, is_active, user_id, created_at, updated_at)
SELECT id, tenant_id, name, contact_no, company_name, address, description, TRUE, user_id, created_at, updated_at
FROM contacts
WHERE type = 'Vendor'
ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    name = EXCLUDED.name,
    contact_no = EXCLUDED.contact_no,
    company_name = EXCLUDED.company_name,
    address = EXCLUDED.address,
    description = EXCLUDED.description,
    updated_at = NOW();

-- 4. Update references in Bills
-- Move contact_id to vendor_id for records where the contact is now a vendor
UPDATE bills b
SET vendor_id = b.contact_id,
    contact_id = NULL
WHERE b.contact_id IN (SELECT id FROM vendors)
AND b.vendor_id IS NULL;

-- 5. Update references in Transactions
UPDATE transactions t
SET vendor_id = t.contact_id,
    contact_id = NULL
WHERE t.contact_id IN (SELECT id FROM vendors)
AND t.vendor_id IS NULL;

-- 6. Update references in Contracts
-- Contracts table already has a vendor_id column, but it might be referencing the contacts table
-- We need to fix the foreign key constraint
DO $$ 
BEGIN
    -- Check if the constraint exists and points to contacts
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'contracts_vendor_id_fkey' 
        AND confrelid = 'contacts'::regclass
    ) THEN
        ALTER TABLE contracts DROP CONSTRAINT contracts_vendor_id_fkey;
        ALTER TABLE contracts ADD CONSTRAINT contracts_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id);
    ELSIF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'contracts_vendor_id_fkey'
    ) THEN
        ALTER TABLE contracts ADD CONSTRAINT contracts_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id);
    END IF;
END $$;

-- 7. Handle Quotations if the table exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quotations') THEN
        -- Add vendor_id column if it doesn't exist (though it likely does)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotations' AND column_name='vendor_id') THEN
            ALTER TABLE quotations ADD COLUMN vendor_id TEXT REFERENCES vendors(id);
        ELSE
            -- Fix FK if it points to contacts
            IF EXISTS (
                SELECT 1 FROM pg_constraint 
                WHERE conname = 'quotations_vendor_id_fkey' 
                AND confrelid = 'contacts'::regclass
            ) THEN
                ALTER TABLE quotations DROP CONSTRAINT quotations_vendor_id_fkey;
                ALTER TABLE quotations ADD CONSTRAINT quotations_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id);
            END IF;
        END IF;
    END IF;
END $$;

-- 8. Final Cleanup: Delete migrated vendors from contacts
DELETE FROM contacts WHERE type = 'Vendor';

COMMIT;
