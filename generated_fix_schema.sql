-- Auto-generated Diff Script

-- Date: 2026-02-03T05:45:41.268Z

ROLLBACK;
BEGIN;


-- MISSING TABLES

CREATE TABLE IF NOT EXISTS inventory_batches (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    inventory_item_id TEXT NOT NULL,
    batch_number TEXT NOT NULL,
    expiry_date DATE,
    manufacture_date DATE,
    warehouse_id TEXT,
    quantity DECIMAL(15, 3) NOT NULL DEFAULT 0,
    cost_price DECIMAL(15, 2),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for inventory_batches

CREATE TABLE IF NOT EXISTS inventory_item_barcodes (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    inventory_item_id TEXT NOT NULL,
    barcode TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for inventory_item_barcodes

CREATE TABLE IF NOT EXISTS inventory_price_tiers (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    inventory_item_id TEXT NOT NULL,
    tier_name TEXT NOT NULL,
    price DECIMAL(15, 2) NOT NULL,
    min_quantity DECIMAL(15, 3) DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for inventory_price_tiers

CREATE TABLE IF NOT EXISTS inventory_serials (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    inventory_item_id TEXT NOT NULL,
    serial_number TEXT NOT NULL,
    warehouse_id TEXT,
    status TEXT NOT NULL DEFAULT 'Available'::text,
    purchase_bill_id TEXT,
    sales_invoice_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for inventory_serials

CREATE TABLE IF NOT EXISTS investment_transactions (
    id TEXT NOT NULL,
    investment_id TEXT NOT NULL,
    transaction_id TEXT,
    type TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for investment_transactions

CREATE TABLE IF NOT EXISTS investments (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    investor_account_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active'::text,
    investment_type TEXT NOT NULL DEFAULT 'Equity'::text,
    principal_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    ownership_percentage DECIMAL(15, 2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for investments

CREATE TABLE IF NOT EXISTS marketplace_ad_images (
    id VARCHAR(100) NOT NULL,
    ad_id VARCHAR(100) NOT NULL,
    image_data BYTEA NOT NULL,
    content_type VARCHAR(100) NOT NULL DEFAULT 'image/jpeg'::character varying,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for marketplace_ad_images

CREATE TABLE IF NOT EXISTS profit_distribution_items (
    id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    investment_id TEXT NOT NULL,
    accrued_profit DECIMAL(15, 2) NOT NULL,
    pay_amount DECIMAL(15, 2) DEFAULT 0,
    reinvest_amount DECIMAL(15, 2) DEFAULT 0,
    target_project_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for profit_distribution_items

CREATE TABLE IF NOT EXISTS profit_distribution_runs (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    financial_year TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Draft'::text,
    locked_at TIMESTAMP,
    locked_by TEXT,
    gl_impact_posted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for profit_distribution_runs

CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_name TEXT NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT now(),
    execution_time_ms INTEGER,
    notes TEXT
);


-- TODO: Check invalid foreign keys for schema_migrations

CREATE TABLE IF NOT EXISTS shop_inventory_items (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    category_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    description TEXT,
    quantity DECIMAL(15, 2) NOT NULL DEFAULT 0,
    price_per_item DECIMAL(15, 2) NOT NULL DEFAULT 0,
    current_stock DECIMAL(15, 2) NOT NULL DEFAULT 0,
    average_cost DECIMAL(15, 2) NOT NULL DEFAULT 0,
    last_purchase_date DATE,
    last_purchase_price DECIMAL(15, 2),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for shop_inventory_items

CREATE TABLE IF NOT EXISTS stock_adjustments (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    inventory_item_id TEXT NOT NULL,
    warehouse_id TEXT,
    quantity DECIMAL(15, 3) NOT NULL,
    type TEXT NOT NULL,
    reason TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    performed_by TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for stock_adjustments

CREATE TABLE IF NOT EXISTS stock_transfers (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    transfer_number TEXT NOT NULL,
    from_warehouse_id TEXT,
    to_warehouse_id TEXT,
    status TEXT NOT NULL DEFAULT 'Pending'::text,
    transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    description TEXT,
    created_by TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for stock_transfers

CREATE TABLE IF NOT EXISTS task_activity_events (
    id TEXT NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    user_id TEXT,
    action_type TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for task_activity_events

CREATE TABLE IF NOT EXISTS task_approvals (
    id TEXT NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    requester_id TEXT,
    approver_id TEXT,
    approver_role TEXT,
    status TEXT NOT NULL DEFAULT 'Pending'::text,
    requested_at TIMESTAMP NOT NULL DEFAULT now(),
    responded_at TIMESTAMP,
    comments TEXT
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for task_approvals

CREATE TABLE IF NOT EXISTS task_assignment_history (
    id TEXT NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    previous_owner_id TEXT,
    new_owner_id TEXT,
    changed_by TEXT,
    change_reason TEXT,
    changed_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for task_assignment_history

CREATE TABLE IF NOT EXISTS task_attachments (
    id TEXT NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT,
    uploaded_by TEXT,
    uploaded_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for task_attachments

CREATE TABLE IF NOT EXISTS task_comments (
    id TEXT NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    user_id TEXT,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'Comment'::text,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    parent_comment_id TEXT,
    mentions TEXT[]
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for task_comments

CREATE TABLE IF NOT EXISTS task_contributors (
    task_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'Contributor'::text,
    assigned_at TIMESTAMP DEFAULT now(),
    assigned_by TEXT
, PRIMARY KEY (task_id)
);


-- TODO: Check invalid foreign keys for task_contributors

CREATE TABLE IF NOT EXISTS task_departments (
    id TEXT NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    parent_id TEXT,
    head_user_id TEXT,
    status TEXT NOT NULL DEFAULT 'Active'::text,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for task_departments

CREATE TABLE IF NOT EXISTS task_dependencies (
    blocking_task_id TEXT NOT NULL,
    dependent_task_id TEXT NOT NULL,
    dependency_type TEXT DEFAULT 'Finish to Start'::text,
    created_at TIMESTAMP DEFAULT now()
, PRIMARY KEY (blocking_task_id)
);


-- TODO: Check invalid foreign keys for task_dependencies

CREATE TABLE IF NOT EXISTS task_holidays (
    id TEXT NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    date DATE NOT NULL,
    type TEXT NOT NULL DEFAULT 'Public'::text,
    is_recurring BOOLEAN DEFAULT false,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for task_holidays

CREATE TABLE IF NOT EXISTS task_initiative_contributors (
    initiative_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'Contributor'::text,
    joined_at TIMESTAMP DEFAULT now()
, PRIMARY KEY (initiative_id)
);


-- TODO: Check invalid foreign keys for task_initiative_contributors

CREATE TABLE IF NOT EXISTS task_initiative_okr_links (
    initiative_id TEXT NOT NULL,
    objective_id TEXT NOT NULL,
    linked_at TIMESTAMP DEFAULT now()
, PRIMARY KEY (initiative_id)
);


-- TODO: Check invalid foreign keys for task_initiative_okr_links

CREATE TABLE IF NOT EXISTS task_initiatives (
    id TEXT NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    owner_id TEXT,
    status TEXT NOT NULL DEFAULT 'Not Started'::text,
    priority TEXT NOT NULL DEFAULT 'Medium'::text,
    health TEXT NOT NULL DEFAULT 'On Track'::text,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    progress_percentage DECIMAL(5, 2) DEFAULT 0,
    department_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    created_by TEXT
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for task_initiatives

CREATE TABLE IF NOT EXISTS task_items (
    id TEXT NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    initiative_id TEXT,
    objective_id TEXT,
    parent_task_id TEXT,
    owner_id TEXT,
    status TEXT NOT NULL DEFAULT 'Not Started'::text,
    priority TEXT NOT NULL DEFAULT 'Medium'::text,
    start_date DATE,
    due_date DATE NOT NULL,
    estimated_hours DECIMAL(6, 2),
    actual_hours DECIMAL(6, 2) DEFAULT 0,
    progress_percentage DECIMAL(5, 2) DEFAULT 0,
    is_recurring BOOLEAN DEFAULT false,
    recurrence_rule TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    created_by TEXT,
    sla_policy TEXT DEFAULT 'Standard'::text,
    sla_due_at TIMESTAMP,
    sla_breach_at TIMESTAMP,
    escalation_level INTEGER DEFAULT 0,
    is_escalated BOOLEAN DEFAULT false
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for task_items

CREATE TABLE IF NOT EXISTS task_key_results (
    id TEXT NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    objective_id TEXT NOT NULL,
    title TEXT NOT NULL,
    owner_id TEXT,
    metric_type TEXT NOT NULL DEFAULT 'Number'::text,
    start_value DECIMAL(15, 2) NOT NULL DEFAULT 0,
    target_value DECIMAL(15, 2) NOT NULL,
    current_value DECIMAL(15, 2) NOT NULL DEFAULT 0,
    progress_percentage DECIMAL(5, 2) DEFAULT 0,
    confidence_score INTEGER DEFAULT 0,
    weight INTEGER DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'Not Started'::text,
    due_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    created_by TEXT
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for task_key_results

CREATE TABLE IF NOT EXISTS task_milestones (
    id TEXT NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    initiative_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'Not Started'::text,
    owner_id TEXT,
    progress_percentage DECIMAL(5, 2) DEFAULT 0,
    sequence_order INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for task_milestones

CREATE TABLE IF NOT EXISTS task_notification_preferences (
    user_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    email_enabled BOOLEAN DEFAULT true,
    in_app_enabled BOOLEAN DEFAULT true,
    push_enabled BOOLEAN DEFAULT false,
    notify_on_assignment BOOLEAN DEFAULT true,
    notify_on_status_change BOOLEAN DEFAULT true,
    notify_on_comments BOOLEAN DEFAULT true,
    notify_on_approval BOOLEAN DEFAULT true,
    notify_on_deadline BOOLEAN DEFAULT true,
    sla_alert_threshold_hours INTEGER DEFAULT 24,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (user_id)
);


-- TODO: Check invalid foreign keys for task_notification_preferences

CREATE TABLE IF NOT EXISTS task_notifications (
    id TEXT NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    reference_id TEXT,
    reference_type TEXT,
    is_read BOOLEAN DEFAULT false,
    is_archived BOOLEAN DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    read_at TIMESTAMP
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for task_notifications

CREATE TABLE IF NOT EXISTS task_objectives (
    id TEXT NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    owner_id TEXT,
    parent_objective_id TEXT,
    period_id TEXT,
    type TEXT NOT NULL DEFAULT 'Operational'::text,
    level TEXT NOT NULL,
    entity_id TEXT,
    status TEXT NOT NULL DEFAULT 'Not Started'::text,
    progress_percentage DECIMAL(5, 2) DEFAULT 0,
    confidence_score INTEGER DEFAULT 0,
    visibility TEXT NOT NULL DEFAULT 'Public'::text,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    created_by TEXT
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for task_objectives

CREATE TABLE IF NOT EXISTS task_okr_updates (
    id TEXT NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    previous_value DECIMAL(15, 2),
    new_value DECIMAL(15, 2),
    previous_progress DECIMAL(5, 2),
    new_progress DECIMAL(5, 2),
    previous_confidence INTEGER,
    new_confidence INTEGER,
    comment TEXT,
    updated_by TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for task_okr_updates

CREATE TABLE IF NOT EXISTS task_periods (
    id TEXT NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    type TEXT NOT NULL DEFAULT 'OKR'::text,
    status TEXT NOT NULL DEFAULT 'Active'::text,
    parent_period_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for task_periods

CREATE TABLE IF NOT EXISTS task_permissions (
    id TEXT NOT NULL DEFAULT uuid_generate_v4(),
    module TEXT NOT NULL,
    action TEXT NOT NULL,
    description TEXT
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for task_permissions

CREATE TABLE IF NOT EXISTS task_progress_updates (
    id TEXT NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    user_id TEXT,
    previous_progress DECIMAL(5, 2),
    new_progress DECIMAL(5, 2),
    comment TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for task_progress_updates

CREATE TABLE IF NOT EXISTS task_reminders (
    id TEXT NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    due_at TIMESTAMP NOT NULL,
    reference_id TEXT,
    is_sent BOOLEAN DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for task_reminders

CREATE TABLE IF NOT EXISTS task_role_assignments (
    role_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    assigned_at TIMESTAMP DEFAULT now(),
    assigned_by TEXT
, PRIMARY KEY (role_id)
);


-- TODO: Check invalid foreign keys for task_role_assignments

CREATE TABLE IF NOT EXISTS task_role_audit_logs (
    id TEXT NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor_id TEXT,
    target_role_id TEXT,
    target_user_id TEXT,
    details JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for task_role_audit_logs

CREATE TABLE IF NOT EXISTS task_role_permissions (
    role_id TEXT NOT NULL,
    permission_id TEXT NOT NULL
, PRIMARY KEY (permission_id)
);


-- TODO: Check invalid foreign keys for task_role_permissions

CREATE TABLE IF NOT EXISTS task_roles (
    id TEXT NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    scope TEXT NOT NULL,
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for task_roles

CREATE TABLE IF NOT EXISTS task_status_history (
    id TEXT NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    previous_status TEXT,
    new_status TEXT NOT NULL,
    changed_by TEXT,
    change_reason TEXT,
    changed_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for task_status_history

CREATE TABLE IF NOT EXISTS task_team_members (
    team_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'Member'::text,
    joined_at TIMESTAMP DEFAULT now()
, PRIMARY KEY (team_id)
);


-- TODO: Check invalid foreign keys for task_team_members

CREATE TABLE IF NOT EXISTS task_teams (
    id TEXT NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    department_id TEXT,
    manager_id TEXT,
    status TEXT NOT NULL DEFAULT 'Active'::text,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
, PRIMARY KEY (id)
);


-- TODO: Check invalid foreign keys for task_teams

CREATE TABLE IF NOT EXISTS task_user_roles (
    user_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    assigned_at TIMESTAMP DEFAULT now(),
    assigned_by TEXT
, PRIMARY KEY (role_id)
);


-- TODO: Check invalid foreign keys for task_user_roles


-- MISSING COLUMNS


-- Missing columns in bills

ALTER TABLE bills ADD COLUMN IF NOT EXISTS document_id TEXT;


-- Missing columns in contracts

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS document_id TEXT;


-- Missing columns in marketplace_ads

ALTER TABLE marketplace_ads ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;

ALTER TABLE marketplace_ads ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0;


-- Missing columns in p2p_invoices

ALTER TABLE p2p_invoices ADD COLUMN IF NOT EXISTS income_category_id TEXT;


-- Missing columns in purchase_orders

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS project_id TEXT;

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS locked_by_tenant_id TEXT;

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS locked_by_user_id TEXT;

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP;


-- Missing columns in registered_suppliers

ALTER TABLE registered_suppliers ADD COLUMN IF NOT EXISTS supplier_name TEXT;

ALTER TABLE registered_suppliers ADD COLUMN IF NOT EXISTS supplier_company TEXT;

ALTER TABLE registered_suppliers ADD COLUMN IF NOT EXISTS supplier_contact_no TEXT;

ALTER TABLE registered_suppliers ADD COLUMN IF NOT EXISTS supplier_address TEXT;

ALTER TABLE registered_suppliers ADD COLUMN IF NOT EXISTS supplier_description TEXT;


-- Missing columns in shop_sales

ALTER TABLE shop_sales ADD COLUMN IF NOT EXISTS total_paid DECIMAL(15, 2) DEFAULT 0;

ALTER TABLE shop_sales ADD COLUMN IF NOT EXISTS change_due DECIMAL(15, 2) DEFAULT 0;


COMMIT;