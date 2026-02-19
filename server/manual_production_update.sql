-- Manual Production Update Script
-- Created at: 2026-02-03
-- This script aggregates recent migrations to ensure production DB is up to date.

BEGIN;

-- ==========================================
-- 1. Tenant Modules
-- From: add-tenant-modules-table.sql
-- ==========================================

CREATE TABLE IF NOT EXISTS tenant_modules (
    id TEXT PRIMARY KEY DEFAULT 'mod_' || substr(md5(random()::text), 1, 16),
    tenant_id TEXT NOT NULL,
    module_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    activated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE(tenant_id, module_key),
    CONSTRAINT valid_status CHECK (status IN ('active', 'expired', 'suspended', 'inactive'))
);

CREATE INDEX IF NOT EXISTS idx_tenant_modules_tenant_id ON tenant_modules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_modules_module_key ON tenant_modules(module_key);
COMMENT ON COLUMN tenant_modules.module_key IS 'Keys: real_estate, rental, tasks, biz_planet';


-- ==========================================
-- 2-3. Shop Module (Removed - moved to standalone MyShop application)
-- See migration: 20260218_remove_shop_tables.sql
-- ==========================================


-- ==========================================
-- 4. Payment Module Key
-- From: add-module-key-to-payments.sql
-- ==========================================

ALTER TABLE payments ADD COLUMN IF NOT EXISTS module_key TEXT;


-- ==========================================
-- 5. Tasks Schema
-- From: add-tasks-schema.sql
-- ==========================================

-- Create tasks table if missing (production may have been created before tasks existed)
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    description TEXT,
    type TEXT NOT NULL DEFAULT 'Personal',
    category TEXT NOT NULL DEFAULT 'General',
    status TEXT NOT NULL DEFAULT 'Not Started',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    hard_deadline DATE NOT NULL DEFAULT CURRENT_DATE,
    kpi_goal TEXT,
    kpi_target_value REAL,
    kpi_current_value REAL DEFAULT 0,
    kpi_unit TEXT,
    kpi_progress_percentage REAL DEFAULT 0,
    assigned_by_id TEXT,
    assigned_to_id TEXT,
    created_by_id TEXT,
    user_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_id ON tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- Add missing columns to tasks table if it exists but is missing columns
DO $$
BEGIN
    -- Check if tasks table exists
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tasks') THEN
        -- Add missing columns if they don't exist
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'assigned_to_id') THEN
            ALTER TABLE tasks ADD COLUMN assigned_to_id TEXT;
            ALTER TABLE tasks ADD CONSTRAINT tasks_assigned_to_id_fkey FOREIGN KEY (assigned_to_id) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'assigned_by_id') THEN
            ALTER TABLE tasks ADD COLUMN assigned_by_id TEXT;
            ALTER TABLE tasks ADD CONSTRAINT tasks_assigned_by_id_fkey FOREIGN KEY (assigned_by_id) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'kpi_progress_percentage') THEN
            ALTER TABLE tasks ADD COLUMN kpi_progress_percentage REAL DEFAULT 0;
            ALTER TABLE tasks ADD CONSTRAINT tasks_kpi_progress_check CHECK (kpi_progress_percentage >= 0 AND kpi_progress_percentage <= 100);
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'kpi_current_value') THEN
            ALTER TABLE tasks ADD COLUMN kpi_current_value REAL DEFAULT 0;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'kpi_target_value') THEN
            ALTER TABLE tasks ADD COLUMN kpi_target_value REAL;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'kpi_unit') THEN
            ALTER TABLE tasks ADD COLUMN kpi_unit TEXT;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'kpi_goal') THEN
            ALTER TABLE tasks ADD COLUMN kpi_goal TEXT;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'hard_deadline') THEN
            ALTER TABLE tasks ADD COLUMN hard_deadline DATE;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'start_date') THEN
            ALTER TABLE tasks ADD COLUMN start_date DATE;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'category') THEN
            ALTER TABLE tasks ADD COLUMN category TEXT;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'type') THEN
            ALTER TABLE tasks ADD COLUMN type TEXT;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'created_by_id') THEN
            ALTER TABLE tasks ADD COLUMN created_by_id TEXT;
            ALTER TABLE tasks ADD CONSTRAINT tasks_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE RESTRICT;
        END IF;
        
        -- Add indexes if they don't exist
        CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_id ON tasks(assigned_to_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_assigned_by_id ON tasks(assigned_by_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_created_by_id ON tasks(created_by_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_hard_deadline ON tasks(hard_deadline);
        CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
        CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
        CREATE INDEX IF NOT EXISTS idx_tasks_tenant_status ON tasks(tenant_id, status);
        CREATE INDEX IF NOT EXISTS idx_tasks_tenant_deadline ON tasks(tenant_id, hard_deadline);
    END IF;
END $$;

-- Create task_updates table if it doesn't exist
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
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- Create task_performance_scores table if it doesn't exist
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

-- Create task_performance_config table if it doesn't exist
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

-- Create indexes for task_updates
CREATE INDEX IF NOT EXISTS idx_task_updates_task_id ON task_updates(task_id);
CREATE INDEX IF NOT EXISTS idx_task_updates_tenant_id ON task_updates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_updates_user_id ON task_updates(user_id);
CREATE INDEX IF NOT EXISTS idx_task_updates_created_at ON task_updates(created_at);

-- Create indexes for task_performance_scores
CREATE INDEX IF NOT EXISTS idx_task_performance_scores_tenant_id ON task_performance_scores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_performance_scores_user_id ON task_performance_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_task_performance_scores_period ON task_performance_scores(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_task_performance_scores_tenant_period ON task_performance_scores(tenant_id, period_start, period_end);

-- Enable Row Level Security
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_performance_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_performance_config ENABLE ROW LEVEL SECURITY;

-- Create/Update RLS policies
DROP POLICY IF EXISTS tenant_isolation_tasks ON tasks;
CREATE POLICY tenant_isolation_tasks ON tasks
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_task_updates ON task_updates;
CREATE POLICY tenant_isolation_task_updates ON task_updates
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_task_performance_scores ON task_performance_scores;
CREATE POLICY tenant_isolation_task_performance_scores ON task_performance_scores
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_task_performance_config ON task_performance_config;
CREATE POLICY tenant_isolation_task_performance_config ON task_performance_config
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());


-- ==========================================
-- 6. Marketplace (Biz Planet)
-- From: add-marketplace-tables.sql
-- ==========================================

CREATE TABLE IF NOT EXISTS marketplace_categories (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS marketplace_ads (
    id VARCHAR(100) PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category_id VARCHAR(50) NOT NULL,
    product_brand VARCHAR(150),
    product_model VARCHAR(150),
    min_order_quantity DECIMAL(15,2),
    unit VARCHAR(50),
    specifications TEXT,
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_marketplace_ads_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_marketplace_ads_category FOREIGN KEY (category_id) REFERENCES marketplace_categories(id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_ads_tenant ON marketplace_ads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_ads_category ON marketplace_ads(category_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_ads_status ON marketplace_ads(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_ads_created ON marketplace_ads(created_at DESC);


-- ==========================================
-- 7. P2P (Procurement-to-Pay)
-- From: add-p2p-tables.sql
-- ==========================================

-- Add supplier metadata columns to tenants table if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'tax_id') THEN
        ALTER TABLE tenants ADD COLUMN tax_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'payment_terms') THEN
        ALTER TABLE tenants ADD COLUMN payment_terms TEXT;
        ALTER TABLE tenants ADD CONSTRAINT valid_payment_terms CHECK (payment_terms IS NULL OR payment_terms IN ('Net 30', 'Net 60', 'Net 90', 'Due on Receipt', 'Custom'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'supplier_category') THEN
        ALTER TABLE tenants ADD COLUMN supplier_category TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'supplier_status') THEN
        ALTER TABLE tenants ADD COLUMN supplier_status TEXT DEFAULT 'Active';
        ALTER TABLE tenants ADD CONSTRAINT valid_supplier_status CHECK (supplier_status IS NULL OR supplier_status IN ('Active', 'Inactive'));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS purchase_orders (
    id TEXT PRIMARY KEY,
    po_number TEXT NOT NULL UNIQUE,
    buyer_tenant_id TEXT NOT NULL,
    supplier_tenant_id TEXT NOT NULL,
    total_amount DECIMAL(15, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENT', 'RECEIVED', 'INVOICED', 'DELIVERED', 'COMPLETED')),
    items TEXT NOT NULL, 
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

CREATE TABLE IF NOT EXISTS p2p_invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT NOT NULL UNIQUE,
    po_id TEXT NOT NULL,
    buyer_tenant_id TEXT NOT NULL,
    supplier_tenant_id TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')),
    items TEXT NOT NULL, 
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

CREATE TABLE IF NOT EXISTS p2p_bills (
    id TEXT PRIMARY KEY,
    bill_number TEXT NOT NULL UNIQUE,
    invoice_id TEXT NOT NULL,
    po_id TEXT NOT NULL,
    buyer_tenant_id TEXT NOT NULL,
    supplier_tenant_id TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    due_date DATE NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE')),
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

CREATE TABLE IF NOT EXISTS p2p_audit_trail (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('PO', 'INVOICE', 'BILL')),
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL, 
    from_status TEXT,
    to_status TEXT,
    performed_by TEXT,
    performed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    notes TEXT,
    tenant_id TEXT NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

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

CREATE TABLE IF NOT EXISTS supplier_registration_requests (
    id TEXT PRIMARY KEY,
    supplier_tenant_id TEXT NOT NULL,
    buyer_tenant_id TEXT NOT NULL,
    buyer_organization_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
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

CREATE INDEX IF NOT EXISTS idx_supplier_reg_req_supplier ON supplier_registration_requests(supplier_tenant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_reg_req_buyer ON supplier_registration_requests(buyer_tenant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_reg_req_status ON supplier_registration_requests(status);
CREATE INDEX IF NOT EXISTS idx_supplier_reg_req_tenant_id ON supplier_registration_requests(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_reg_req_unique_pending ON supplier_registration_requests(supplier_tenant_id, buyer_tenant_id) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS registered_suppliers (
    id TEXT PRIMARY KEY,
    buyer_tenant_id TEXT NOT NULL,
    supplier_tenant_id TEXT NOT NULL,
    registration_request_id TEXT, 
    registered_at TIMESTAMP NOT NULL DEFAULT NOW(),
    registered_by TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'REMOVED')),
    notes TEXT, 
    tenant_id TEXT NOT NULL, 
    supplier_name TEXT, 
    supplier_company TEXT, 
    supplier_contact_no TEXT, 
    supplier_address TEXT, 
    supplier_description TEXT, 
    FOREIGN KEY (buyer_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (supplier_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (registration_request_id) REFERENCES supplier_registration_requests(id) ON DELETE SET NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE(buyer_tenant_id, supplier_tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_registered_suppliers_buyer ON registered_suppliers(buyer_tenant_id);
CREATE INDEX IF NOT EXISTS idx_registered_suppliers_supplier ON registered_suppliers(supplier_tenant_id);
CREATE INDEX IF NOT EXISTS idx_registered_suppliers_status ON registered_suppliers(status);
CREATE INDEX IF NOT EXISTS idx_registered_suppliers_tenant_id ON registered_suppliers(tenant_id);


-- ==========================================
-- 8. Shop RLS Policies (Removed - moved to standalone MyShop application)
-- ==========================================


-- ==========================================
-- 9. WhatsApp Integration
-- From: add-whatsapp-integration.sql
-- ==========================================

CREATE TABLE IF NOT EXISTS whatsapp_configs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    api_key TEXT NOT NULL,
    api_secret TEXT,
    phone_number_id TEXT NOT NULL,
    business_account_id TEXT,
    verify_token TEXT NOT NULL,
    webhook_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE(tenant_id)
);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    contact_id TEXT,
    phone_number TEXT NOT NULL,
    message_id TEXT UNIQUE,
    wam_id TEXT,
    direction TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent',
    message_text TEXT,
    media_url TEXT,
    media_type TEXT, 
    media_caption TEXT,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    read_at TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
    CONSTRAINT valid_direction CHECK (direction IN ('outgoing', 'incoming')),
    CONSTRAINT valid_status CHECK (status IN ('sending', 'sent', 'delivered', 'read', 'failed', 'received'))
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_configs_tenant_id ON whatsapp_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_configs_active ON whatsapp_configs(tenant_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant_id ON whatsapp_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_contact_id ON whatsapp_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone_number ON whatsapp_messages(tenant_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_message_id ON whatsapp_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_timestamp ON whatsapp_messages(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_unread ON whatsapp_messages(tenant_id, phone_number, read_at) WHERE direction = 'incoming' AND read_at IS NULL;


-- ==========================================
-- 10. Investment Management
-- NOTE: The file add-investment-management-tables.sql could not be found on disk.
-- Please paste the content of that migration here if it is missing in production.
-- ==========================================

COMMIT;
