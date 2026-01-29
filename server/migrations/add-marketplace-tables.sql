-- Migration: Add Marketplace Tables (Biz Planet)
-- Description: Product listings for suppliers; buyers browse and contact suppliers (not e-commerce).
-- Limit: 2 ads per supplier per calendar day.
-- Date: 2026-01-29

-- ============================================================================
-- Marketplace categories (fixed list; can extend later)
-- ============================================================================
CREATE TABLE IF NOT EXISTS marketplace_categories (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Seed default categories
INSERT INTO marketplace_categories (id, name, display_order) VALUES
    ('raw_materials', 'Raw Materials', 1),
    ('machinery_equipment', 'Machinery & Equipment', 2),
    ('consumables', 'Consumables', 3),
    ('services', 'Services', 4),
    ('construction', 'Construction Materials', 5),
    ('electrical', 'Electrical & Electronics', 6),
    ('packaging', 'Packaging', 7),
    ('other', 'Other', 99)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Marketplace ads (supplier product listings)
-- ============================================================================
CREATE TABLE IF NOT EXISTS marketplace_ads (
    id VARCHAR(100) PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL,
    
    -- Listing
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category_id VARCHAR(50) NOT NULL,
    
    -- Product details (optional structured info)
    product_brand VARCHAR(150),
    product_model VARCHAR(150),
    min_order_quantity DECIMAL(15,2),
    unit VARCHAR(50),
    specifications TEXT,
    
    -- Contact (shown to buyers; defaults from tenant if null)
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT fk_marketplace_ads_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_marketplace_ads_category FOREIGN KEY (category_id) REFERENCES marketplace_categories(id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_ads_tenant ON marketplace_ads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_ads_category ON marketplace_ads(category_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_ads_status ON marketplace_ads(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_ads_created ON marketplace_ads(created_at DESC);
