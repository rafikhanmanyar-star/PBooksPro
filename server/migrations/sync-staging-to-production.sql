-- Migration Script: Sync Staging Database to Match Production
-- Generated automatically - Review before running!
-- Date: 2026-01-19T00:00:00.000Z
-- Updated: Full schema sync including P2P, Tasks, WhatsApp, Audit Trail, and more

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
    reg_supplier_name TEXT,
    reg_supplier_company TEXT,
    reg_supplier_contact_no TEXT,
    reg_supplier_address TEXT,
    reg_supplier_description TEXT,
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
    supplier_name TEXT, -- Supplier name from registration
    supplier_company TEXT, -- Supplier company from registration
    supplier_contact_no TEXT, -- Supplier contact number from registration
    supplier_address TEXT, -- Supplier address from registration
    supplier_description TEXT, -- Supplier description from registration
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

-- ============================================================================
-- PURCHASE ORDERS - Additional Columns
-- ============================================================================

-- Add target_delivery_date column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'purchase_orders' AND column_name = 'target_delivery_date'
    ) THEN
        ALTER TABLE purchase_orders ADD COLUMN target_delivery_date DATE;
        RAISE NOTICE 'Column target_delivery_date added to purchase_orders table';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_po_target_delivery_date ON purchase_orders(target_delivery_date);

-- ============================================================================
-- BILLS TABLE - Version Column for Optimistic Locking
-- ============================================================================

-- Add version column to bills table
ALTER TABLE bills ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Create index on (id, version) for efficient conflict detection
CREATE INDEX IF NOT EXISTS idx_bills_id_version ON bills(id, version);

-- ============================================================================
-- USERS TABLE - Login Status Column
-- ============================================================================

-- Add login_status column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'login_status'
    ) THEN
        ALTER TABLE users ADD COLUMN login_status BOOLEAN NOT NULL DEFAULT FALSE;
        RAISE NOTICE 'Added login_status column to users table';
    END IF;
END $$;

-- Create indexes for login_status
CREATE INDEX IF NOT EXISTS idx_users_login_status ON users(login_status);
CREATE INDEX IF NOT EXISTS idx_users_tenant_login_status ON users(tenant_id, login_status);

-- ============================================================================
-- PROJECT AGREEMENTS - Installment Plan Column
-- ============================================================================

-- Add installment_plan column as JSONB to store the plan configuration
ALTER TABLE project_agreements ADD COLUMN IF NOT EXISTS installment_plan JSONB;

-- ============================================================================
-- TRANSACTION AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS transaction_audit_log (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    transaction_id TEXT,
    user_id TEXT, -- Nullable to allow user deletion while preserving audit trail
    user_name TEXT NOT NULL,
    user_role TEXT NOT NULL,
    action TEXT NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'VIEW'
    transaction_type TEXT,
    amount DECIMAL(15, 2),
    description TEXT,
    old_values JSONB,
    new_values JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Make user_id nullable if it exists with NOT NULL constraint
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'transaction_audit_log' 
        AND column_name = 'user_id'
        AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE transaction_audit_log ALTER COLUMN user_id DROP NOT NULL;
        RAISE NOTICE 'Successfully made transaction_audit_log.user_id nullable';
    END IF;
END $$;

-- Transaction audit log indexes
CREATE INDEX IF NOT EXISTS idx_transaction_audit_log_tenant_id ON transaction_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transaction_audit_log_user_id ON transaction_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_transaction_audit_log_transaction_id ON transaction_audit_log(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_audit_log_created_at ON transaction_audit_log(created_at);

-- ============================================================================
-- USER SESSIONS (for preventing duplicate logins)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    ip_address TEXT,
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Cleanup duplicate sessions (keep newest per user_id, tenant_id)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_sessions') THEN
    DELETE FROM user_sessions a
    USING user_sessions b
    WHERE a.user_id = b.user_id
      AND a.tenant_id = b.tenant_id
      AND (
        a.created_at < b.created_at
        OR (a.created_at = b.created_at AND a.id < b.id)
      );
  END IF;
END $$;

-- Unique index to enforce single session per user per tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_sessions_user_tenant ON user_sessions(user_id, tenant_id);

-- Session indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_tenant_id ON user_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- ============================================================================
-- TASK MANAGEMENT SYSTEM
-- ============================================================================

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL CHECK (type IN ('Personal', 'Assigned')),
    category TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Not Started', 'In Progress', 'Review', 'Completed')),
    start_date DATE NOT NULL,
    hard_deadline DATE NOT NULL,
    kpi_goal TEXT,
    kpi_target_value REAL,
    kpi_current_value REAL DEFAULT 0,
    kpi_unit TEXT,
    kpi_progress_percentage REAL DEFAULT 0 CHECK (kpi_progress_percentage >= 0 AND kpi_progress_percentage <= 100),
    assigned_by_id TEXT,
    assigned_to_id TEXT,
    created_by_id TEXT NOT NULL,
    user_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT valid_deadline CHECK (hard_deadline >= start_date)
);

-- Add missing columns to tasks table if they don't exist (for existing databases)
DO $$ 
BEGIN
    -- Add assigned_by_id column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'assigned_by_id'
    ) THEN
        ALTER TABLE tasks ADD COLUMN assigned_by_id TEXT;
        RAISE NOTICE 'Column assigned_by_id added to tasks table';
    END IF;

    -- Add assigned_to_id column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'assigned_to_id'
    ) THEN
        ALTER TABLE tasks ADD COLUMN assigned_to_id TEXT;
        RAISE NOTICE 'Column assigned_to_id added to tasks table';
    END IF;

    -- Add created_by_id column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'created_by_id'
    ) THEN
        ALTER TABLE tasks ADD COLUMN created_by_id TEXT;
        RAISE NOTICE 'Column created_by_id added to tasks table';
    END IF;

    -- Add user_id column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE tasks ADD COLUMN user_id TEXT;
        RAISE NOTICE 'Column user_id added to tasks table';
    END IF;

    -- Add kpi_goal column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'kpi_goal'
    ) THEN
        ALTER TABLE tasks ADD COLUMN kpi_goal TEXT;
        RAISE NOTICE 'Column kpi_goal added to tasks table';
    END IF;

    -- Add kpi_target_value column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'kpi_target_value'
    ) THEN
        ALTER TABLE tasks ADD COLUMN kpi_target_value REAL;
        RAISE NOTICE 'Column kpi_target_value added to tasks table';
    END IF;

    -- Add kpi_current_value column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'kpi_current_value'
    ) THEN
        ALTER TABLE tasks ADD COLUMN kpi_current_value REAL DEFAULT 0;
        RAISE NOTICE 'Column kpi_current_value added to tasks table';
    END IF;

    -- Add kpi_unit column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'kpi_unit'
    ) THEN
        ALTER TABLE tasks ADD COLUMN kpi_unit TEXT;
        RAISE NOTICE 'Column kpi_unit added to tasks table';
    END IF;

    -- Add kpi_progress_percentage column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'kpi_progress_percentage'
    ) THEN
        ALTER TABLE tasks ADD COLUMN kpi_progress_percentage REAL DEFAULT 0;
        RAISE NOTICE 'Column kpi_progress_percentage added to tasks table';
    END IF;
END $$;

-- Add foreign keys for tasks table if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tasks_assigned_by_id_fkey'
    ) THEN
        ALTER TABLE tasks ADD CONSTRAINT tasks_assigned_by_id_fkey 
            FOREIGN KEY (assigned_by_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tasks_assigned_to_id_fkey'
    ) THEN
        ALTER TABLE tasks ADD CONSTRAINT tasks_assigned_to_id_fkey 
            FOREIGN KEY (assigned_to_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tasks_created_by_id_fkey'
    ) THEN
        -- Use SET NULL instead of RESTRICT for migration safety
        ALTER TABLE tasks ADD CONSTRAINT tasks_created_by_id_fkey 
            FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Task updates/comment history table
CREATE TABLE IF NOT EXISTS task_updates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    update_type TEXT NOT NULL CHECK (update_type IN ('Status Change', 'KPI Update', 'Comment', 'Check-in')),
    status_before TEXT,
    status_after TEXT,
    kpi_value_before REAL,
    kpi_value_after REAL,
    comment TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Add foreign key for task_updates.user_id if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'task_updates_user_id_fkey'
    ) THEN
        ALTER TABLE task_updates ADD CONSTRAINT task_updates_user_id_fkey 
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Task performance scores table (for leaderboard)
CREATE TABLE IF NOT EXISTS task_performance_scores (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_tasks INTEGER DEFAULT 0,
    completed_tasks INTEGER DEFAULT 0,
    on_time_completions INTEGER DEFAULT 0,
    overdue_tasks INTEGER DEFAULT 0,
    average_kpi_achievement REAL DEFAULT 0,
    completion_rate REAL DEFAULT 0 CHECK (completion_rate >= 0 AND completion_rate <= 100),
    deadline_adherence_rate REAL DEFAULT 0 CHECK (deadline_adherence_rate >= 0 AND deadline_adherence_rate <= 100),
    performance_score REAL DEFAULT 0,
    calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(tenant_id, user_id, period_start, period_end)
);

-- Task performance configuration (Admin-configurable weights)
CREATE TABLE IF NOT EXISTS task_performance_config (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL UNIQUE,
    completion_rate_weight REAL DEFAULT 0.33 CHECK (completion_rate_weight >= 0 AND completion_rate_weight <= 1),
    deadline_adherence_weight REAL DEFAULT 0.33 CHECK (deadline_adherence_weight >= 0 AND deadline_adherence_weight <= 1),
    kpi_achievement_weight REAL DEFAULT 0.34 CHECK (kpi_achievement_weight >= 0 AND kpi_achievement_weight <= 1),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT weights_sum_to_one CHECK (
        ABS((completion_rate_weight + deadline_adherence_weight + kpi_achievement_weight) - 1.0) < 0.01
    )
);

-- Task indexes
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_id ON tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_id ON tasks(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by_id ON tasks(created_by_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_hard_deadline ON tasks(hard_deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_status ON tasks(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_deadline ON tasks(tenant_id, hard_deadline);

CREATE INDEX IF NOT EXISTS idx_task_updates_task_id ON task_updates(task_id);
CREATE INDEX IF NOT EXISTS idx_task_updates_tenant_id ON task_updates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_updates_user_id ON task_updates(user_id);
CREATE INDEX IF NOT EXISTS idx_task_updates_created_at ON task_updates(created_at);

CREATE INDEX IF NOT EXISTS idx_task_performance_scores_tenant_id ON task_performance_scores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_performance_scores_user_id ON task_performance_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_task_performance_scores_period ON task_performance_scores(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_task_performance_scores_tenant_period ON task_performance_scores(tenant_id, period_start, period_end);

-- ============================================================================
-- WHATSAPP BUSINESS API INTEGRATION
-- ============================================================================

-- WhatsApp Configurations table
CREATE TABLE IF NOT EXISTS whatsapp_configs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    
    -- API Credentials (encrypted)
    api_key TEXT NOT NULL,
    api_secret TEXT,
    
    -- WhatsApp Business API Identifiers
    phone_number_id TEXT NOT NULL,
    business_account_id TEXT,
    
    -- Webhook Configuration
    verify_token TEXT NOT NULL,
    webhook_url TEXT,
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE(tenant_id)
);

-- WhatsApp Messages table
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    
    -- Contact Information
    contact_id TEXT,
    phone_number TEXT NOT NULL,
    
    -- Message Identifiers
    message_id TEXT UNIQUE,
    wam_id TEXT, -- WhatsApp API Message ID
    
    -- Message Details
    direction TEXT NOT NULL, -- 'outgoing' or 'incoming'
    status TEXT NOT NULL DEFAULT 'sent', -- 'sending', 'sent', 'delivered', 'read', 'failed', 'received'
    message_text TEXT,
    
    -- Media (optional)
    media_url TEXT,
    media_type TEXT, -- 'image', 'video', 'document', 'audio', 'sticker'
    media_caption TEXT,
    
    -- Timestamps
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    read_at TIMESTAMP, -- When message was read (for incoming messages)
    
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
    CONSTRAINT valid_direction CHECK (direction IN ('outgoing', 'incoming')),
    CONSTRAINT valid_status CHECK (status IN ('sending', 'sent', 'delivered', 'read', 'failed', 'received'))
);

-- WhatsApp indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_configs_tenant_id ON whatsapp_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_configs_active ON whatsapp_configs(tenant_id, is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant_id ON whatsapp_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_contact_id ON whatsapp_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone_number ON whatsapp_messages(tenant_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_message_id ON whatsapp_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_timestamp ON whatsapp_messages(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_unread ON whatsapp_messages(tenant_id, phone_number, read_at) WHERE direction = 'incoming' AND read_at IS NULL;

COMMIT;

-- ============================================================================
-- Migration complete!
-- Tables and Columns Added/Updated:
--
-- PAYMENT TABLES:
--   - payment_webhooks
--   - payments
--   - subscriptions
--
-- P2P SYSTEM TABLES:
--   - Tenant supplier metadata columns (is_supplier, tax_id, payment_terms, etc.)
--   - purchase_orders (+ target_delivery_date column)
--   - p2p_invoices
--   - p2p_bills
--   - p2p_audit_trail
--   - supplier_registration_requests
--   - registered_suppliers
--
-- AUDIT & SESSION TABLES:
--   - transaction_audit_log
--   - user_sessions
--
-- TASK MANAGEMENT TABLES:
--   - tasks
--   - task_updates
--   - task_performance_scores
--   - task_performance_config
--
-- WHATSAPP INTEGRATION TABLES:
--   - whatsapp_configs
--   - whatsapp_messages
--
-- COLUMN ADDITIONS:
--   - bills.version (optimistic locking)
--   - users.login_status (duplicate login prevention)
--   - project_agreements.installment_plan (JSONB)
--   - purchase_orders.target_delivery_date
-- ============================================================================