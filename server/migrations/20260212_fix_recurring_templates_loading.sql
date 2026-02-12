-- Migration: Fix recurring_invoice_templates loading issue
-- Date: 2026-02-12
-- Description: Ensures recurring_invoice_templates table exists and RLS is properly configured
--              This fixes the issue where templates save but don't load on re-login in production

BEGIN;

-- 1. Ensure the table exists (idempotent)
CREATE TABLE IF NOT EXISTS recurring_invoice_templates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id TEXT,
    contact_id TEXT NOT NULL,
    property_id TEXT NOT NULL,
    building_id TEXT,
    amount DECIMAL(15, 2) NOT NULL,
    description_template TEXT NOT NULL,
    day_of_month INTEGER NOT NULL,
    next_due_date TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    agreement_id TEXT,
    invoice_type TEXT DEFAULT 'Rental',
    frequency TEXT,
    auto_generate BOOLEAN NOT NULL DEFAULT FALSE,
    max_occurrences INTEGER,
    generated_count INTEGER NOT NULL DEFAULT 0,
    last_generated_date TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. Drop any overly-strict FK constraints (except tenant_id)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'recurring_invoice_templates'::regclass
          AND contype = 'f'
          AND conname != 'recurring_invoice_templates_tenant_id_fkey'
    )
    LOOP
        EXECUTE format('ALTER TABLE recurring_invoice_templates DROP CONSTRAINT %I', r.conname);
        RAISE NOTICE 'Dropped FK constraint: %', r.conname;
    END LOOP;
EXCEPTION
    WHEN undefined_table THEN NULL; -- table doesn't exist yet, ignore
END $$;

-- 3. Ensure building_id is nullable
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'recurring_invoice_templates'
          AND column_name = 'building_id'
          AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE recurring_invoice_templates ALTER COLUMN building_id DROP NOT NULL;
        RAISE NOTICE 'Made building_id nullable';
    END IF;
END $$;

-- 4. Add invoice_type column if missing (for older schemas)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'recurring_invoice_templates' AND column_name = 'invoice_type'
    ) THEN
        ALTER TABLE recurring_invoice_templates ADD COLUMN invoice_type TEXT DEFAULT 'Rental';
        UPDATE recurring_invoice_templates SET invoice_type = 'Rental' WHERE invoice_type IS NULL;
        RAISE NOTICE 'Added invoice_type column';
    END IF;
END $$;

-- 5. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_recurring_templates_tenant ON recurring_invoice_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recurring_templates_contact ON recurring_invoice_templates(contact_id);
CREATE INDEX IF NOT EXISTS idx_recurring_templates_property ON recurring_invoice_templates(contact_id);
CREATE INDEX IF NOT EXISTS idx_recurring_templates_active ON recurring_invoice_templates(tenant_id, active) WHERE active = TRUE;

-- 6. Ensure get_current_tenant_id function exists
CREATE OR REPLACE FUNCTION get_current_tenant_id() RETURNS TEXT AS $$
    SELECT current_setting('app.current_tenant_id', TRUE);
$$ LANGUAGE sql STABLE;

-- 7. Enable RLS and create policy
ALTER TABLE recurring_invoice_templates ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS tenant_isolation ON recurring_invoice_templates;

-- Create tenant isolation policy (standard pattern)
CREATE POLICY tenant_isolation ON recurring_invoice_templates
    FOR ALL 
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- 8. Verify the fix by checking table structure
DO $$
DECLARE
    col_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO col_count 
    FROM information_schema.columns 
    WHERE table_name = 'recurring_invoice_templates';
    RAISE NOTICE 'Recurring invoice templates table has % columns', col_count;
END $$;


COMMIT;
