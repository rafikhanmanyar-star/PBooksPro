-- Migration: Standardize rental_agreements to use org_id (multi-tenancy) + contact_id (renter)
-- Background: The old schema used tenant_id for the property renter (contact).
-- After multi-tenancy was introduced, org_id was added for the organization,
-- and contact_id replaced tenant_id for the renter. But tenant_id was never
-- dropped, causing NOT NULL constraint violations on new inserts.
-- Date: 2026-02-26

-- 1. Ensure contact_id exists
ALTER TABLE rental_agreements ADD COLUMN IF NOT EXISTS contact_id TEXT;

-- 2. Ensure org_id exists
ALTER TABLE rental_agreements ADD COLUMN IF NOT EXISTS org_id TEXT;

-- 3. For old records: copy tenant_id → contact_id where contact_id is still NULL
UPDATE rental_agreements SET contact_id = tenant_id WHERE contact_id IS NULL AND tenant_id IS NOT NULL;

-- 4. For old records: copy tenant_id → org_id where org_id is still NULL
UPDATE rental_agreements SET org_id = tenant_id WHERE org_id IS NULL AND tenant_id IS NOT NULL;

-- 5. Drop NOT NULL constraint on tenant_id (it's now redundant)
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'rental_agreements' AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE rental_agreements ALTER COLUMN tenant_id DROP NOT NULL;
        ALTER TABLE rental_agreements ALTER COLUMN tenant_id SET DEFAULT NULL;
    END IF;
END $$;

-- 6. Ensure org_id has NOT NULL (now that it's populated)
-- Skip if there are still NULLs (shouldn't happen, but be safe)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM rental_agreements WHERE org_id IS NULL) THEN
        ALTER TABLE rental_agreements ALTER COLUMN org_id SET NOT NULL;
    END IF;
END $$;

-- 7. Add UNIQUE constraint on (org_id, agreement_number) if not exists
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rental_agreements_org_id_agreement_number_key'
    ) THEN
        BEGIN
            ALTER TABLE rental_agreements ADD CONSTRAINT rental_agreements_org_id_agreement_number_key UNIQUE (org_id, agreement_number);
        EXCEPTION WHEN duplicate_table THEN
            -- constraint already exists under different name
        END;
    END IF;
END $$;

-- 8. Add performance indexes on org_id (queries now use org_id exclusively)
CREATE INDEX IF NOT EXISTS idx_rental_agreements_org_id ON rental_agreements(org_id);
CREATE INDEX IF NOT EXISTS idx_rental_agreements_org_id_updated ON rental_agreements(org_id, updated_at);
