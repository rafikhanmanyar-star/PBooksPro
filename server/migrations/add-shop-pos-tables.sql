
-- Migration: Add Shop & POS Tables
-- Enterprise Retail Suite for PBooksPro

-- 1. Branches & Stores
CREATE TABLE IF NOT EXISTS shop_branches (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'Flagship',
    status TEXT NOT NULL DEFAULT 'Active',
    location TEXT,
    region TEXT,
    manager_name TEXT,
    contact_no TEXT,
    timezone TEXT DEFAULT 'GMT+5',
    open_time TIME,
    close_time TIME,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

-- 2. POS Terminals
CREATE TABLE IF NOT EXISTS shop_terminals (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id TEXT NOT NULL REFERENCES shop_branches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Online',
    version TEXT,
    last_sync TIMESTAMP,
    ip_address TEXT,
    health_score INTEGER DEFAULT 100,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

-- 3. Warehouses
CREATE TABLE IF NOT EXISTS shop_warehouses (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    location TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

-- 4. Shop Products (Extends or replaces base products if needed, but let's keep it dedicated for retail)
CREATE TABLE IF NOT EXISTS shop_products (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sku TEXT NOT NULL,
    barcode TEXT,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    unit TEXT DEFAULT 'pcs',
    cost_price DECIMAL(15, 2) DEFAULT 0,
    retail_price DECIMAL(15, 2) DEFAULT 0,
    tax_rate DECIMAL(5, 2) DEFAULT 0,
    reorder_point INTEGER DEFAULT 10,
    image_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, sku)
);

-- 5. Inventory Stock (Per Warehouse)
CREATE TABLE IF NOT EXISTS shop_inventory (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
    warehouse_id TEXT NOT NULL REFERENCES shop_warehouses(id) ON DELETE CASCADE,
    quantity_on_hand DECIMAL(15, 2) DEFAULT 0,
    quantity_reserved DECIMAL(15, 2) DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, product_id, warehouse_id)
);

-- 6. Loyalty Members
CREATE TABLE IF NOT EXISTS shop_loyalty_members (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    card_number TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'Silver',
    points_balance INTEGER DEFAULT 0,
    lifetime_points INTEGER DEFAULT 0,
    total_spend DECIMAL(15, 2) DEFAULT 0,
    visit_count INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Active',
    joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, card_number),
    UNIQUE(tenant_id, customer_id)
);

-- 7. POS Sales (Master)
CREATE TABLE IF NOT EXISTS shop_sales (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES shop_branches(id),
    terminal_id TEXT REFERENCES shop_terminals(id),
    user_id TEXT REFERENCES users(id),
    customer_id TEXT REFERENCES contacts(id),
    loyalty_member_id TEXT REFERENCES shop_loyalty_members(id),
    
    sale_number TEXT NOT NULL,
    subtotal DECIMAL(15, 2) NOT NULL,
    tax_total DECIMAL(15, 2) NOT NULL,
    discount_total DECIMAL(15, 2) DEFAULT 0,
    grand_total DECIMAL(15, 2) NOT NULL,
    
    payment_method TEXT NOT NULL, -- 'Multiple' if split
    payment_details JSONB, -- Stores breakdown of multiple tenders
    status TEXT NOT NULL DEFAULT 'Completed',
    
    points_earned INTEGER DEFAULT 0,
    points_redeemed INTEGER DEFAULT 0,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, sale_number)
);

-- 8. POS Sale Items (Detail)
CREATE TABLE IF NOT EXISTS shop_sale_items (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sale_id TEXT NOT NULL REFERENCES shop_sales(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES shop_products(id),
    quantity DECIMAL(15, 2) NOT NULL,
    unit_price DECIMAL(15, 2) NOT NULL,
    tax_amount DECIMAL(15, 2) DEFAULT 0,
    discount_amount DECIMAL(15, 2) DEFAULT 0,
    subtotal DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 9. Inventory Movements (Ledger)
CREATE TABLE IF NOT EXISTS shop_inventory_movements (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES shop_products(id),
    warehouse_id TEXT NOT NULL REFERENCES shop_warehouses(id),
    type TEXT NOT NULL, -- 'Sale', 'Purchase', 'Adjustment', 'Transfer', 'Return'
    quantity DECIMAL(15, 2) NOT NULL, -- Positive for IN, Negative for OUT
    reference_id TEXT, -- Sale ID, Purchase ID, etc
    reason TEXT,
    user_id TEXT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shop_sales_tenant ON shop_sales(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shop_inventory_product ON shop_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_shop_products_sku ON shop_products(tenant_id, sku);
CREATE INDEX IF NOT EXISTS idx_shop_loyalty_customer ON shop_loyalty_members(customer_id);

-- Enable RLS (Security)
ALTER TABLE shop_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_loyalty_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_inventory_movements ENABLE ROW LEVEL SECURITY;

-- Note: Policies need to be added per tenant_id but for now we follow the existing server structure.
