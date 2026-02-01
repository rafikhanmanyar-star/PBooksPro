
-- Table for storing tenant-level shop policies
CREATE TABLE IF NOT EXISTS shop_policies (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    allow_negative_stock BOOLEAN DEFAULT FALSE,
    universal_pricing BOOLEAN DEFAULT TRUE,
    tax_inclusive BOOLEAN DEFAULT FALSE,
    default_tax_rate DECIMAL(5,2) DEFAULT 0.00,
    require_manager_approval BOOLEAN DEFAULT FALSE,
    loyalty_redemption_ratio DECIMAL(5,4) DEFAULT 0.0100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE shop_policies ENABLE ROW LEVEL SECURITY;

-- Add RLS policy for shop_policies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'shop_policies' AND policyname = 'tenant_isolation_policy'
    ) THEN
        CREATE POLICY tenant_isolation_policy ON shop_policies
        USING (tenant_id = (current_setting('app.current_tenant_id')::uuid));
    END IF;
END $$;
