-- Migration: Add contact_id column to rental_agreements table
-- This migration adds a contact_id column to store the tenant contact ID
-- Previously, the tenant contact ID was not being stored, causing data loss on refresh

-- Add contact_id column to rental_agreements table
ALTER TABLE rental_agreements 
ADD COLUMN IF NOT EXISTS contact_id TEXT;

-- Add foreign key constraint (if it doesn't already exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_rental_agreements_contact_id'
    ) THEN
        ALTER TABLE rental_agreements
        ADD CONSTRAINT fk_rental_agreements_contact_id 
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_rental_agreements_contact_id ON rental_agreements(contact_id);

-- Note: Existing rows will have contact_id = NULL
-- These will need to be updated manually or through a data migration if needed
