-- Migration: Add warehouses table
-- This migration adds support for warehouse management in inventory settings

-- ============================================================================
-- WAREHOUSES
-- ============================================================================

-- Warehouses table
CREATE TABLE IF NOT EXISTS warehouses (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    name TEXT NOT NULL,
    address TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(tenant_id, name)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_warehouses_tenant_id ON warehouses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_user_id ON warehouses(user_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_name ON warehouses(name);
CREATE INDEX IF NOT EXISTS idx_warehouses_tenant_name ON warehouses(tenant_id, name);

-- Enable Row Level Security
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
DROP POLICY IF EXISTS tenant_isolation_warehouses ON warehouses;
CREATE POLICY tenant_isolation_warehouses ON warehouses
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE))
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE));

-- Log migration completion
DO $$ 
BEGIN
    RAISE NOTICE 'Migration completed: warehouses table created successfully';
END $$;
