-- Migration: Add org_id column to rental_agreements and backfill from tenant_id
-- This separates organization tenant ID from contact tenant ID

-- Add org_id column (organization tenant ID)
ALTER TABLE rental_agreements
ADD COLUMN IF NOT EXISTS org_id TEXT;

-- Backfill org_id from legacy tenant_id (organization) if present
DO $$
BEGIN
    -- Only try to backfill if tenant_id column exists
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'rental_agreements' 
        AND column_name = 'tenant_id'
    ) THEN
        UPDATE rental_agreements
        SET org_id = tenant_id
        WHERE org_id IS NULL AND tenant_id IS NOT NULL;
        
        RAISE NOTICE 'Backfilled org_id from tenant_id for existing rental agreements';
    ELSE
        RAISE NOTICE 'tenant_id column not found, skipping backfill';
    END IF;
END $$;

-- Replace legacy unique constraint (tenant_id, agreement_number) with org_id version
ALTER TABLE rental_agreements
DROP CONSTRAINT IF EXISTS rental_agreements_tenant_id_agreement_number_key;

-- Add unique constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'rental_agreements_org_id_agreement_number_key'
        AND table_name = 'rental_agreements'
    ) THEN
        ALTER TABLE rental_agreements
        ADD CONSTRAINT rental_agreements_org_id_agreement_number_key
        UNIQUE (org_id, agreement_number);
    END IF;
END $$;

-- Replace legacy foreign key constraint on tenant_id if it exists
ALTER TABLE rental_agreements
DROP CONSTRAINT IF EXISTS rental_agreements_tenant_id_fkey;

-- Add foreign key constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'rental_agreements_org_id_fkey'
        AND table_name = 'rental_agreements'
    ) THEN
        ALTER TABLE rental_agreements
        ADD CONSTRAINT rental_agreements_org_id_fkey
        FOREIGN KEY (org_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create index for org_id
CREATE INDEX IF NOT EXISTS idx_rental_agreements_org_id ON rental_agreements(org_id);
