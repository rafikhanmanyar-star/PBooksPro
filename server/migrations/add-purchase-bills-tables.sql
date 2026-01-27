-- Migration: Add purchase_bills and purchase_bill_items tables
-- This migration adds support for purchase bills/invoices tracking in My Shop section

-- ============================================================================
-- PURCHASE BILLS (Shop Purchase Invoices from Vendors)
-- ============================================================================

-- Purchase Bills table (header/parent record)
CREATE TABLE IF NOT EXISTS purchase_bills (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    bill_number TEXT NOT NULL,
    vendor_id TEXT NOT NULL,
    bill_date DATE NOT NULL,
    due_date DATE,
    description TEXT,
    
    -- Financial tracking
    total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    paid_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Unpaid' CHECK (status IN ('Unpaid', 'Partially Paid', 'Paid')),
    
    -- Inventory tracking
    items_received BOOLEAN NOT NULL DEFAULT FALSE,
    items_received_date DATE,
    
    -- References
    project_id TEXT,
    
    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (vendor_id) REFERENCES contacts(id) ON DELETE RESTRICT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    UNIQUE(tenant_id, bill_number)
);

-- Purchase Bill Items table (line items/details)
CREATE TABLE IF NOT EXISTS purchase_bill_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    purchase_bill_id TEXT NOT NULL,
    inventory_item_id TEXT NOT NULL,
    
    -- Item details
    item_name TEXT NOT NULL,
    description TEXT,
    quantity DECIMAL(15, 3) NOT NULL,
    received_quantity DECIMAL(15, 3) NOT NULL DEFAULT 0, -- Quantity received (for partial receiving)
    price_per_unit DECIMAL(15, 2) NOT NULL,
    total_amount DECIMAL(15, 2) NOT NULL,
    
    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (purchase_bill_id) REFERENCES purchase_bills(id) ON DELETE CASCADE,
    FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE RESTRICT
);

-- Purchase Bill Payments table (payment tracking)
CREATE TABLE IF NOT EXISTS purchase_bill_payments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    purchase_bill_id TEXT NOT NULL,
    
    -- Payment details
    amount DECIMAL(15, 2) NOT NULL,
    payment_date DATE NOT NULL,
    payment_account_id TEXT NOT NULL,
    description TEXT,
    
    -- Link to transaction in main ledger
    transaction_id TEXT,
    
    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (purchase_bill_id) REFERENCES purchase_bills(id) ON DELETE CASCADE,
    FOREIGN KEY (payment_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
);

-- Inventory Stock table (current stock levels with FIFO/weighted average costing)
CREATE TABLE IF NOT EXISTS inventory_stock (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    inventory_item_id TEXT NOT NULL,
    
    -- Stock tracking
    current_quantity DECIMAL(15, 3) NOT NULL DEFAULT 0,
    average_cost DECIMAL(15, 2) NOT NULL DEFAULT 0,
    
    -- Last purchase info
    last_purchase_date DATE,
    last_purchase_price DECIMAL(15, 2),
    last_purchase_bill_id TEXT,
    
    -- Metadata
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
    FOREIGN KEY (last_purchase_bill_id) REFERENCES purchase_bills(id) ON DELETE SET NULL,
    UNIQUE(tenant_id, inventory_item_id)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Purchase Bills indexes
CREATE INDEX IF NOT EXISTS idx_purchase_bills_tenant_id ON purchase_bills(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_vendor_id ON purchase_bills(vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_user_id ON purchase_bills(user_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_bill_date ON purchase_bills(bill_date);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_status ON purchase_bills(status);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_project_id ON purchase_bills(project_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_tenant_status ON purchase_bills(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_tenant_vendor ON purchase_bills(tenant_id, vendor_id);

-- Purchase Bill Items indexes
CREATE INDEX IF NOT EXISTS idx_purchase_bill_items_tenant_id ON purchase_bill_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bill_items_bill_id ON purchase_bill_items(purchase_bill_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bill_items_inventory_item_id ON purchase_bill_items(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bill_items_tenant_bill ON purchase_bill_items(tenant_id, purchase_bill_id);

-- Purchase Bill Payments indexes
CREATE INDEX IF NOT EXISTS idx_purchase_bill_payments_tenant_id ON purchase_bill_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bill_payments_bill_id ON purchase_bill_payments(purchase_bill_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bill_payments_account_id ON purchase_bill_payments(payment_account_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bill_payments_transaction_id ON purchase_bill_payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bill_payments_payment_date ON purchase_bill_payments(payment_date);

-- Inventory Stock indexes
CREATE INDEX IF NOT EXISTS idx_inventory_stock_tenant_id ON inventory_stock(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_stock_inventory_item_id ON inventory_stock(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_stock_last_purchase_bill_id ON inventory_stock(last_purchase_bill_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE purchase_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_bill_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stock ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS tenant_isolation_purchase_bills ON purchase_bills;
CREATE POLICY tenant_isolation_purchase_bills ON purchase_bills
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_purchase_bill_items ON purchase_bill_items;
CREATE POLICY tenant_isolation_purchase_bill_items ON purchase_bill_items
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_purchase_bill_payments ON purchase_bill_payments;
CREATE POLICY tenant_isolation_purchase_bill_payments ON purchase_bill_payments
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_inventory_stock ON inventory_stock;
CREATE POLICY tenant_isolation_inventory_stock ON inventory_stock
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- ============================================================================
-- TRIGGER: Auto-update inventory stock when bill is paid and items received
-- ============================================================================

CREATE OR REPLACE FUNCTION update_inventory_stock_on_purchase()
RETURNS TRIGGER AS $$
DECLARE
    item RECORD;
BEGIN
    -- Only update stock when bill is marked as paid AND items are received
    IF NEW.status = 'Paid' AND NEW.items_received = TRUE AND 
       (OLD.status != 'Paid' OR OLD.items_received = FALSE) THEN
        
        -- Loop through all items in this purchase bill
        FOR item IN 
            SELECT * FROM purchase_bill_items 
            WHERE purchase_bill_id = NEW.id AND tenant_id = NEW.tenant_id
        LOOP
            -- Update or insert inventory stock using weighted average costing
            INSERT INTO inventory_stock (
                id,
                tenant_id,
                inventory_item_id,
                current_quantity,
                average_cost,
                last_purchase_date,
                last_purchase_price,
                last_purchase_bill_id,
                updated_at
            ) VALUES (
                'stock_' || item.inventory_item_id,
                NEW.tenant_id,
                item.inventory_item_id,
                item.quantity,
                item.price_per_unit,
                NEW.bill_date,
                item.price_per_unit,
                NEW.id,
                NOW()
            )
            ON CONFLICT (tenant_id, inventory_item_id) 
            DO UPDATE SET
                current_quantity = inventory_stock.current_quantity + item.quantity,
                average_cost = (
                    (inventory_stock.current_quantity * inventory_stock.average_cost) + 
                    (item.quantity * item.price_per_unit)
                ) / (inventory_stock.current_quantity + item.quantity),
                last_purchase_date = NEW.bill_date,
                last_purchase_price = item.price_per_unit,
                last_purchase_bill_id = NEW.id,
                updated_at = NOW();
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_inventory_stock ON purchase_bills;
CREATE TRIGGER trigger_update_inventory_stock
    AFTER INSERT OR UPDATE ON purchase_bills
    FOR EACH ROW
    EXECUTE FUNCTION update_inventory_stock_on_purchase();

-- Log migration completion
DO $$ 
BEGIN
    RAISE NOTICE 'Migration completed: purchase_bills tables created successfully';
END $$;
