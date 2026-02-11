-- Migration: Create recurring_invoice_templates table (or fix existing)
-- Date: 2026-02-11
-- Description: Ensures the recurring_invoice_templates table exists in PostgreSQL
--              and drops overly-strict foreign key constraints that cause INSERT failures.
--              The client may send empty-string building_id (no building selected),
--              which violates FK constraints that SQLite never enforced.

BEGIN;

-- 1. Create table if it doesn't exist yet (no FK constraints on contact/property/building)
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

-- 2. Drop foreign key constraints if they exist (from earlier schema version)
--    These cause INSERT failures because the client sends empty strings for optional relations
--    and SQLite never enforced FKs, so the app was designed without strict FK compliance.
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
END $$;

-- 3. Make building_id nullable if it was NOT NULL
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'recurring_invoice_templates'
          AND column_name = 'building_id'
          AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE recurring_invoice_templates ALTER COLUMN building_id DROP NOT NULL;
    END IF;
END $$;

-- 4. Performance indexes
CREATE INDEX IF NOT EXISTS idx_recurring_templates_tenant ON recurring_invoice_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recurring_templates_contact ON recurring_invoice_templates(contact_id);
CREATE INDEX IF NOT EXISTS idx_recurring_templates_property ON recurring_invoice_templates(property_id);

-- 5. Enable RLS
ALTER TABLE recurring_invoice_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON recurring_invoice_templates;
CREATE POLICY tenant_isolation ON recurring_invoice_templates
    FOR ALL USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

COMMIT;
