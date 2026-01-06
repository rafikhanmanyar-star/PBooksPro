-- Migration: Add user_id column to contracts table
-- This migration adds the user_id column to track which user created/updated each contract
-- for contract logs and synchronizing records across the organization

-- Add user_id column to contracts table (nullable for existing records)
ALTER TABLE contracts 
ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Add foreign key constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'contracts_user_id_fkey'
    ) THEN
        ALTER TABLE contracts 
        ADD CONSTRAINT contracts_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Create index for user_id if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_contracts_user_id ON contracts(user_id);

-- Note: Existing contracts will have user_id = NULL
-- You may want to update existing records with a default user or leave them as NULL
-- depending on your business requirements

