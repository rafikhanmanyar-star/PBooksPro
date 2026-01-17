-- Migration: Add contact_id column to rental_agreements (PostgreSQL)
-- This migration adds the contact_id column that was missing from the schema
-- but is already being used in the API code.

-- Add contact_id column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'rental_agreements' 
        AND column_name = 'contact_id'
    ) THEN
        ALTER TABLE rental_agreements
        ADD COLUMN contact_id TEXT;
        
        -- Backfill contact_id from tenant_id if tenant_id column exists and has data
        -- This handles migration from old schema where tenant_id was the contact reference
        IF EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'rental_agreements' 
            AND column_name = 'tenant_id'
        ) THEN
            -- Migrate existing data: copy tenant_id to contact_id where contact_id is NULL
            -- tenant_id in rental_agreements refers to the contact (tenant person), not the organization
            UPDATE rental_agreements
            SET contact_id = tenant_id
            WHERE contact_id IS NULL AND tenant_id IS NOT NULL;
            
            RAISE NOTICE 'Backfilled contact_id from tenant_id for existing rental agreements';
        END IF;
    END IF;
END $$;

-- Add foreign key constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'rental_agreements_contact_id_fkey'
        AND table_name = 'rental_agreements'
    ) THEN
        ALTER TABLE rental_agreements
        ADD CONSTRAINT rental_agreements_contact_id_fkey
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- Create index for contact_id if it doesn't exist (for better query performance)
CREATE INDEX IF NOT EXISTS idx_rental_agreements_contact_id ON rental_agreements(contact_id);
