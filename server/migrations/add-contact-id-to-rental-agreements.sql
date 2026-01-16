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
        
        -- Backfill contact_id from existing data if needed
        -- Note: This assumes there's existing data that needs migration
        -- If no data exists, this can be skipped
        
        -- Add foreign key constraint
        ALTER TABLE rental_agreements
        ADD CONSTRAINT rental_agreements_contact_id_fkey
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT;
        
        -- Make it NOT NULL after backfilling (if needed)
        -- ALTER TABLE rental_agreements ALTER COLUMN contact_id SET NOT NULL;
    END IF;
END $$;

-- Create index for contact_id if it doesn't exist (for better query performance)
CREATE INDEX IF NOT EXISTS idx_rental_agreements_contact_id ON rental_agreements(contact_id);
