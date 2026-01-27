-- Migration: Add inventory_items table
-- This migration adds support for hierarchical inventory item management

-- Create inventory_items table
CREATE TABLE IF NOT EXISTS inventory_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    name TEXT NOT NULL,
    parent_id TEXT,
    expense_category_id TEXT,
    unit_type TEXT NOT NULL CHECK (unit_type IN ('LENGTH_FEET', 'AREA_SQFT', 'VOLUME_CUFT', 'QUANTITY')),
    price_per_unit DECIMAL(15, 2) NOT NULL DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_id) REFERENCES inventory_items(id) ON DELETE SET NULL,
    FOREIGN KEY (expense_category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_inventory_items_tenant_id ON inventory_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_parent_id ON inventory_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_user_id ON inventory_items(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_name ON inventory_items(name);
CREATE INDEX IF NOT EXISTS idx_inventory_items_tenant_name ON inventory_items(tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_inventory_items_expense_category_id ON inventory_items(expense_category_id);

-- Enable Row Level Security
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
DROP POLICY IF EXISTS tenant_isolation_inventory_items ON inventory_items;
CREATE POLICY tenant_isolation_inventory_items ON inventory_items
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE))
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE));

-- Log migration completion
DO $$ 
BEGIN
    RAISE NOTICE 'Migration completed: inventory_items table created successfully';
END $$;
