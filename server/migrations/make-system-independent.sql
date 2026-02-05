-- Migration to make system accounts and categories tenant-independent
-- This allows system entities (is_permanent = TRUE) to be shared across all tenants

-- 1. Make tenant_id nullable in accounts and categories
ALTER TABLE accounts ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE categories ALTER COLUMN tenant_id DROP NOT NULL;

-- 2. Update RLS policies to allow global access to system entities
-- We need to update the isolation policy for all tables that use it
DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN 
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('accounts', 'categories', 'app_settings')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t.table_name);
        EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL USING (tenant_id = get_current_tenant_id() OR tenant_id IS NULL) WITH CHECK (tenant_id = get_current_tenant_id() OR tenant_id IS NULL)', t.table_name);
    END LOOP;
END $$;

-- 3. Move existing system entities to global (tenant_id = NULL)
-- We'll identify them by ID prefixes or the is_permanent flag
UPDATE accounts SET tenant_id = NULL WHERE is_permanent = TRUE OR id LIKE 'sys-acc-%';
UPDATE categories SET tenant_id = NULL WHERE is_permanent = TRUE OR id LIKE 'sys-cat-%';

-- 4. Fix foreign key constraints if necessary (PostgreSQL handles NULLs in FKs by skipping validation, 
-- but our IDs match the PKs in accounts/categories, so FKs will still point to the same rows)
