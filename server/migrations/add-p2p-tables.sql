-- Migration: Add P2P (Procurement-to-Pay) System Tables
-- This migration adds supplier metadata to tenants and creates P2P tables

-- ============================================================================
-- SUPPLIER METADATA (Extend Tenants Table)
-- ============================================================================

-- Add supplier metadata columns to tenants table if they don't exist
DO $$ 
BEGIN
    -- Add tax_id column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'tax_id'
    ) THEN
        ALTER TABLE tenants ADD COLUMN tax_id TEXT;
        RAISE NOTICE 'Column tax_id added to tenants table';
    END IF;

    -- Add payment_terms column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'payment_terms'
    ) THEN
        ALTER TABLE tenants ADD COLUMN payment_terms TEXT;
        -- Add check constraint
        ALTER TABLE tenants ADD CONSTRAINT valid_payment_terms 
            CHECK (payment_terms IS NULL OR payment_terms IN ('Net 30', 'Net 60', 'Net 90', 'Due on Receipt', 'Custom'));
        RAISE NOTICE 'Column payment_terms added to tenants table';
    END IF;

    -- Add supplier_category column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'supplier_category'
    ) THEN
        ALTER TABLE tenants ADD COLUMN supplier_category TEXT;
        RAISE NOTICE 'Column supplier_category added to tenants table';
    END IF;

    -- Add supplier_status column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'supplier_status'
    ) THEN
        ALTER TABLE tenants ADD COLUMN supplier_status TEXT DEFAULT 'Active';
        -- Add check constraint
        ALTER TABLE tenants ADD CONSTRAINT valid_supplier_status 
            CHECK (supplier_status IS NULL OR supplier_status IN ('Active', 'Inactive'));
        RAISE NOTICE 'Column supplier_status added to tenants table';
    END IF;
END $$;

-- ============================================================================
-- PURCHASE ORDERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS purchase_orders (
    id TEXT PRIMARY KEY,
    po_number TEXT NOT NULL UNIQUE,
    buyer_tenant_id TEXT NOT NULL,
    supplier_tenant_id TEXT NOT NULL,
    total_amount DECIMAL(15, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' 
        CHECK (status IN ('DRAFT', 'SENT', 'RECEIVED', 'INVOICED', 'DELIVERED', 'COMPLETED')),
    items TEXT NOT NULL, -- JSON array of POItem
    description TEXT,
    created_by TEXT,
    sent_at TIMESTAMP,
    received_at TIMESTAMP,
    delivered_at TIMESTAMP,
    completed_at TIMESTAMP,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (buyer_tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (supplier_tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ============================================================================
-- P2P INVOICES
-- ============================================================================

CREATE TABLE IF NOT EXISTS p2p_invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT NOT NULL UNIQUE,
    po_id TEXT NOT NULL,
    buyer_tenant_id TEXT NOT NULL,
    supplier_tenant_id TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' 
        CHECK (status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')),
    items TEXT NOT NULL, -- JSON array matching PO items
    reviewed_by TEXT,
    reviewed_at TIMESTAMP,
    rejected_reason TEXT,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    FOREIGN KEY (buyer_tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (supplier_tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ============================================================================
-- P2P BILLS
-- ============================================================================

CREATE TABLE IF NOT EXISTS p2p_bills (
    id TEXT PRIMARY KEY,
    bill_number TEXT NOT NULL UNIQUE,
    invoice_id TEXT NOT NULL,
    po_id TEXT NOT NULL,
    buyer_tenant_id TEXT NOT NULL,
    supplier_tenant_id TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    due_date DATE NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'UNPAID' 
        CHECK (payment_status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE')),
    paid_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    paid_at TIMESTAMP,
    payment_account_id TEXT,
    transaction_id TEXT,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (invoice_id) REFERENCES p2p_invoices(id) ON DELETE RESTRICT,
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    FOREIGN KEY (buyer_tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (supplier_tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (payment_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ============================================================================
-- P2P AUDIT TRAIL
-- ============================================================================

CREATE TABLE IF NOT EXISTS p2p_audit_trail (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('PO', 'INVOICE', 'BILL')),
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL, -- 'STATUS_CHANGE', 'CREATED', 'APPROVED', 'REJECTED'
    from_status TEXT,
    to_status TEXT,
    performed_by TEXT,
    performed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    notes TEXT,
    tenant_id TEXT NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_po_buyer_tenant ON purchase_orders(buyer_tenant_id);
CREATE INDEX IF NOT EXISTS idx_po_supplier_tenant ON purchase_orders(supplier_tenant_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_tenant_id ON purchase_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_p2p_invoices_po_id ON p2p_invoices(po_id);
CREATE INDEX IF NOT EXISTS idx_p2p_invoices_status ON p2p_invoices(status);
CREATE INDEX IF NOT EXISTS idx_p2p_invoices_buyer_tenant ON p2p_invoices(buyer_tenant_id);
CREATE INDEX IF NOT EXISTS idx_p2p_invoices_supplier_tenant ON p2p_invoices(supplier_tenant_id);
CREATE INDEX IF NOT EXISTS idx_p2p_invoices_tenant_id ON p2p_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_p2p_bills_invoice_id ON p2p_bills(invoice_id);
CREATE INDEX IF NOT EXISTS idx_p2p_bills_due_date ON p2p_bills(due_date);
CREATE INDEX IF NOT EXISTS idx_p2p_bills_payment_status ON p2p_bills(payment_status);
CREATE INDEX IF NOT EXISTS idx_p2p_bills_tenant_id ON p2p_bills(tenant_id);
CREATE INDEX IF NOT EXISTS idx_p2p_audit_trail_entity ON p2p_audit_trail(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_p2p_audit_trail_tenant_id ON p2p_audit_trail(tenant_id);
