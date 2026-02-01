
-- Table for storing tenant-level shop policies
CREATE TABLE IF NOT EXISTS shop_policies (
    tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    allow_negative_stock BOOLEAN DEFAULT FALSE,
    universal_pricing BOOLEAN DEFAULT TRUE,
    tax_inclusive BOOLEAN DEFAULT FALSE,
    default_tax_rate DECIMAL(5,2) DEFAULT 0.00,
    require_manager_approval BOOLEAN DEFAULT FALSE,
    loyalty_redemption_ratio DECIMAL(5,4) DEFAULT 0.0100,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE shop_policies ENABLE ROW LEVEL SECURITY;

-- Add RLS policy for shop_policies
-- Using DROP/CREATE for better compatibility with various SQL execution tools
DROP POLICY IF EXISTS tenant_isolation_policy ON shop_policies;

CREATE POLICY tenant_isolation_policy ON shop_policies
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());
