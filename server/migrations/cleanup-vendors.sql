-- Migration: Cleanup Vendor IDs and Foreign Keys
-- Date: 2026-02-04

-- 1. Bills already has vendor_id. We're good there.
-- 2. Contracts: Shift vendor_id_new back to vendor_id (but pointing to vendors)

-- Drop the old constraint that pointed to contacts
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_vendor_id_fkey') THEN
        ALTER TABLE contracts DROP CONSTRAINT contracts_vendor_id_fkey;
    END IF;
END $$;

-- Update vendor_id with values from vendor_id_new (which was populated from contacts for vendors)
UPDATE contracts SET vendor_id = vendor_id_new WHERE vendor_id_new IS NOT NULL;

-- Make vendor_id point to vendors table
ALTER TABLE contracts ADD CONSTRAINT contracts_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id);

-- Drop the temporary column
ALTER TABLE contracts DROP COLUMN IF EXISTS vendor_id_new;

-- 3. Quotations:
-- If quotations table exists, make its vendor_id point to vendors
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quotations') THEN
        -- Drop old constraint if exists
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotations_vendor_id_fkey') THEN
            ALTER TABLE quotations DROP CONSTRAINT quotations_vendor_id_fkey;
        END IF;
        
        -- Add new constraint
        ALTER TABLE quotations ADD CONSTRAINT quotations_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id);
    END IF;
END $$;

-- 4. Transactions:
-- Transactions already had vendor_id added in previous migration.
-- Let's make sure it's clean.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_vendor_id_fkey') THEN
        ALTER TABLE transactions ADD CONSTRAINT transactions_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id);
    END IF;
END $$;
