-- Migration: Add Shop Sales Tables
-- Description: Create tables for retail sales management (My Shop feature)
-- Date: 2026-01-28

-- ============================================================================
-- Shop Configuration Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS shop_config (
    id VARCHAR(100) PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL,
    
    -- Shop Details
    shop_name VARCHAR(255),
    shop_address TEXT,
    shop_phone VARCHAR(50),
    shop_email VARCHAR(255),
    
    -- Pricing Configuration
    default_profit_margin_percent DECIMAL(5,2) DEFAULT 20.00,
    tax_enabled BOOLEAN DEFAULT false,
    tax_percent DECIMAL(5,2) DEFAULT 0.00,
    tax_name VARCHAR(50) DEFAULT 'Tax',
    
    -- Invoice Configuration
    invoice_prefix VARCHAR(20) DEFAULT 'INV',
    invoice_footer_text TEXT,
    
    -- Display Settings
    show_stock_quantity BOOLEAN DEFAULT true,
    low_stock_threshold INTEGER DEFAULT 10,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT fk_shop_config_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shop_config_tenant ON shop_config(tenant_id);

-- ============================================================================
-- Shop Sales Invoices Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS shop_sales (
    id VARCHAR(100) PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL,
    user_id VARCHAR(100),
    
    -- Invoice Details
    invoice_number VARCHAR(50) NOT NULL,
    sale_date DATE NOT NULL,
    
    -- Customer (Optional)
    customer_id VARCHAR(100), -- Links to contacts table (Customer type)
    customer_name VARCHAR(255), -- Store name even if no customer record
    customer_phone VARCHAR(50),
    
    -- Financial Details
    subtotal DECIMAL(15,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    discount_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    
    -- Payment Details
    paid_amount DECIMAL(15,2) DEFAULT 0,
    payment_method VARCHAR(50) DEFAULT 'Cash',
    payment_account_id VARCHAR(100), -- Links to accounts table
    
    -- Status
    status VARCHAR(20) DEFAULT 'Completed' CHECK (status IN ('Completed', 'Cancelled', 'Returned')),
    
    -- Notes
    notes TEXT,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT fk_shop_sales_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_shop_sales_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_shop_sales_customer FOREIGN KEY (customer_id) REFERENCES contacts(id) ON DELETE SET NULL,
    CONSTRAINT fk_shop_sales_payment_account FOREIGN KEY (payment_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
    CONSTRAINT uk_shop_sales_invoice UNIQUE (tenant_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_shop_sales_tenant ON shop_sales(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shop_sales_date ON shop_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_shop_sales_status ON shop_sales(status);
CREATE INDEX IF NOT EXISTS idx_shop_sales_customer ON shop_sales(customer_id);

-- ============================================================================
-- Shop Sales Items Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS shop_sale_items (
    id VARCHAR(100) PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL,
    sale_id VARCHAR(100) NOT NULL,
    
    -- Item Details
    inventory_item_id VARCHAR(100) NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    
    -- Quantity & Pricing
    quantity DECIMAL(10,2) NOT NULL,
    cost_price DECIMAL(15,2) NOT NULL, -- Purchase cost from inventory
    selling_price DECIMAL(15,2) NOT NULL, -- Selling price per unit
    profit_margin_percent DECIMAL(5,2),
    
    -- Line Total
    line_total DECIMAL(15,2) NOT NULL,
    line_profit DECIMAL(15,2) NOT NULL, -- (selling_price - cost_price) * quantity
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT fk_shop_sale_items_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_shop_sale_items_sale FOREIGN KEY (sale_id) REFERENCES shop_sales(id) ON DELETE CASCADE,
    CONSTRAINT fk_shop_sale_items_inventory FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_shop_sale_items_tenant ON shop_sale_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shop_sale_items_sale ON shop_sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_shop_sale_items_inventory ON shop_sale_items(inventory_item_id);

-- ============================================================================
-- Create default shop config for existing tenants
-- ============================================================================
INSERT INTO shop_config (id, tenant_id, shop_name, default_profit_margin_percent)
SELECT 
    'shop_config_' || t.id,
    t.id,
    'My Shop',
    20.00
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM shop_config sc WHERE sc.tenant_id = t.id
)
ON CONFLICT (id) DO NOTHING;
