-- Migration Script: Sync Staging Database to Match Production
-- Generated automatically - Review before running!
-- Date: 2026-01-18T00:00:00.000Z
-- Updated: Added P2P (Procurement-to-Pay) System Tables

BEGIN;

-- ============================================================================
-- PAYMENT TABLES
-- ============================================================================

-- Table: payment_webhooks
CREATE TABLE IF NOT EXISTS payment_webhooks (
    id TEXT NOT NULL,
    gateway TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    signature TEXT,
    processed BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_gateway ON public.payment_webhooks USING btree (gateway);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_event_type ON public.payment_webhooks USING btree (event_type);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_processed ON public.payment_webhooks USING btree (processed);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_created_at ON public.payment_webhooks USING btree (created_at);


-- Table: payments
CREATE TABLE IF NOT EXISTS payments (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    payment_intent_id TEXT,
    amount NUMERIC NOT NULL,
    currency TEXT NOT NULL DEFAULT 'PKR'::text,
    status TEXT NOT NULL DEFAULT 'pending'::text,
    payment_method TEXT,
    gateway TEXT NOT NULL,
    gateway_transaction_id TEXT,
    license_type TEXT NOT NULL,
    license_duration_months INTEGER NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    paid_at TIMESTAMP WITHOUT TIME ZONE,
    PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_tenant_id_fkey'
  ) THEN
    ALTER TABLE payments ADD CONSTRAINT payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_payment_intent_id_key'
  ) THEN
    ALTER TABLE payments ADD CONSTRAINT payments_payment_intent_id_key UNIQUE (payment_intent_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_license_type'
  ) THEN
    ALTER TABLE payments ADD CONSTRAINT valid_license_type CHECK ((license_type = ANY (ARRAY['trial'::text, 'monthly'::text, 'yearly'::text, 'perpetual'::text])));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_status'
  ) THEN
    ALTER TABLE payments ADD CONSTRAINT valid_status CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'expired'::text, 'revoked'::text])));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_currency'
  ) THEN
    ALTER TABLE payments ADD CONSTRAINT valid_currency CHECK ((currency = ANY (ARRAY['PKR'::text, 'USD'::text])));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON public.payments USING btree (tenant_id);

CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments USING btree (status);

CREATE INDEX IF NOT EXISTS idx_payments_payment_intent_id ON public.payments USING btree (payment_intent_id);

CREATE INDEX IF NOT EXISTS idx_payments_gateway_transaction_id ON public.payments USING btree (gateway_transaction_id);

CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments USING btree (created_at);


-- Table: subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    payment_id TEXT,
    status TEXT NOT NULL DEFAULT 'active'::text,
    billing_cycle TEXT NOT NULL,
    next_billing_date TIMESTAMP WITHOUT TIME ZONE,
    canceled_at TIMESTAMP WITHOUT TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_payment_id_fkey'
  ) THEN
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_tenant_id_fkey'
  ) THEN
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_billing_cycle'
  ) THEN
    ALTER TABLE subscriptions ADD CONSTRAINT valid_billing_cycle CHECK ((billing_cycle = ANY (ARRAY['monthly'::text, 'yearly'::text])));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_subscription_status'
  ) THEN
    ALTER TABLE subscriptions ADD CONSTRAINT valid_subscription_status CHECK ((status = ANY (ARRAY['active'::text, 'canceled'::text, 'expired'::text, 'past_due'::text])));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_id ON public.subscriptions USING btree (tenant_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions USING btree (status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing_date ON public.subscriptions USING btree (next_billing_date);


-- ============================================================================
-- P2P (PROCUREMENT-TO-PAY) SYSTEM TABLES
-- ============================================================================

-- ============================================================================
-- SUPPLIER METADATA (Extend Tenants Table)
-- ============================================================================

-- Add supplier metadata columns to tenants table if they don't exist
DO $$ 
BEGIN
    -- Add is_supplier column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'is_supplier'
    ) THEN
        ALTER TABLE tenants ADD COLUMN is_supplier BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Column is_supplier added to tenants table';
    END IF;

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
-- SUPPLIER REGISTRATION REQUESTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS supplier_registration_requests (
    id TEXT PRIMARY KEY,
    supplier_tenant_id TEXT NOT NULL,
    buyer_tenant_id TEXT NOT NULL,
    buyer_organization_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' 
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    supplier_message TEXT,
    buyer_comments TEXT,
    requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMP,
    reviewed_by TEXT,
    tenant_id TEXT NOT NULL,
    FOREIGN KEY (supplier_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (buyer_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ============================================================================
-- REGISTERED SUPPLIERS (Track approved supplier-buyer relationships)
-- ============================================================================

CREATE TABLE IF NOT EXISTS registered_suppliers (
    id TEXT PRIMARY KEY,
    buyer_tenant_id TEXT NOT NULL,
    supplier_tenant_id TEXT NOT NULL,
    registration_request_id TEXT, -- Link to original registration request
    registered_at TIMESTAMP NOT NULL DEFAULT NOW(),
    registered_by TEXT, -- Buyer tenant_id who approved
    status TEXT NOT NULL DEFAULT 'ACTIVE' 
        CHECK (status IN ('ACTIVE', 'SUSPENDED', 'REMOVED')),
    notes TEXT, -- Optional notes from buyer
    tenant_id TEXT NOT NULL, -- Buyer's tenant_id for multi-tenancy
    FOREIGN KEY (buyer_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (supplier_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (registration_request_id) REFERENCES supplier_registration_requests(id) ON DELETE SET NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    -- Ensure unique buyer-supplier relationship (one supplier can only be registered once per buyer)
    UNIQUE(buyer_tenant_id, supplier_tenant_id)
);

-- ============================================================================
-- P2P INDEXES
-- ============================================================================

-- Purchase Orders indexes
CREATE INDEX IF NOT EXISTS idx_po_buyer_tenant ON purchase_orders(buyer_tenant_id);
CREATE INDEX IF NOT EXISTS idx_po_supplier_tenant ON purchase_orders(supplier_tenant_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_tenant_id ON purchase_orders(tenant_id);

-- P2P Invoices indexes
CREATE INDEX IF NOT EXISTS idx_p2p_invoices_po_id ON p2p_invoices(po_id);
CREATE INDEX IF NOT EXISTS idx_p2p_invoices_status ON p2p_invoices(status);
CREATE INDEX IF NOT EXISTS idx_p2p_invoices_buyer_tenant ON p2p_invoices(buyer_tenant_id);
CREATE INDEX IF NOT EXISTS idx_p2p_invoices_supplier_tenant ON p2p_invoices(supplier_tenant_id);
CREATE INDEX IF NOT EXISTS idx_p2p_invoices_tenant_id ON p2p_invoices(tenant_id);

-- P2P Bills indexes
CREATE INDEX IF NOT EXISTS idx_p2p_bills_invoice_id ON p2p_bills(invoice_id);
CREATE INDEX IF NOT EXISTS idx_p2p_bills_due_date ON p2p_bills(due_date);
CREATE INDEX IF NOT EXISTS idx_p2p_bills_payment_status ON p2p_bills(payment_status);
CREATE INDEX IF NOT EXISTS idx_p2p_bills_tenant_id ON p2p_bills(tenant_id);

-- P2P Audit Trail indexes
CREATE INDEX IF NOT EXISTS idx_p2p_audit_trail_entity ON p2p_audit_trail(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_p2p_audit_trail_tenant_id ON p2p_audit_trail(tenant_id);

-- Supplier Registration Requests indexes
CREATE INDEX IF NOT EXISTS idx_supplier_reg_req_supplier ON supplier_registration_requests(supplier_tenant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_reg_req_buyer ON supplier_registration_requests(buyer_tenant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_reg_req_status ON supplier_registration_requests(status);
CREATE INDEX IF NOT EXISTS idx_supplier_reg_req_tenant_id ON supplier_registration_requests(tenant_id);

-- Create unique partial index to prevent duplicate pending requests
CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_reg_req_unique_pending 
    ON supplier_registration_requests(supplier_tenant_id, buyer_tenant_id) 
    WHERE status = 'PENDING';

-- Registered Suppliers indexes
CREATE INDEX IF NOT EXISTS idx_registered_suppliers_buyer ON registered_suppliers(buyer_tenant_id);
CREATE INDEX IF NOT EXISTS idx_registered_suppliers_supplier ON registered_suppliers(supplier_tenant_id);
CREATE INDEX IF NOT EXISTS idx_registered_suppliers_status ON registered_suppliers(status);
CREATE INDEX IF NOT EXISTS idx_registered_suppliers_tenant_id ON registered_suppliers(tenant_id);

-- Tenants is_supplier index for faster supplier lookups
CREATE INDEX IF NOT EXISTS idx_tenants_is_supplier ON tenants(is_supplier) WHERE is_supplier = TRUE;

COMMIT;

-- ============================================================================
-- Migration complete!
-- P2P System Tables Added:
--   - Tenant supplier metadata columns (is_supplier, tax_id, payment_terms, etc.)
--   - purchase_orders
--   - p2p_invoices
--   - p2p_bills
--   - p2p_audit_trail
--   - supplier_registration_requests
--   - registered_suppliers
-- ============================================================================