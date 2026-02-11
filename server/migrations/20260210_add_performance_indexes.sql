-- Migration: Add performance indexes for core tables
-- Date: 2026-02-10
-- Description: Adds missing indexes on tenant_id and updated_at columns across all core tables.
--              Without these indexes, every query with WHERE tenant_id = $1 does a full table scan.
--              This is the single biggest performance improvement for query speed.

BEGIN;

-- ============================================================
-- 1. Core tenant_id indexes (enables fast tenant isolation)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_accounts_tenant ON accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vendors_tenant ON vendors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant ON transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bills_tenant ON bills(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_buildings_tenant ON buildings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_properties_tenant ON properties(tenant_id);
CREATE INDEX IF NOT EXISTS idx_units_tenant ON units(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rental_agreements_tenant ON rental_agreements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_project_agreements_tenant ON project_agreements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_installment_plans_tenant ON installment_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotations_tenant ON quotations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_budgets_tenant ON budgets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_tenant ON sales_returns(tenant_id);

-- ============================================================
-- 2. Composite indexes for sync/state endpoint (tenant + updated_at)
--    These are critical for the /api/state/changes endpoint which
--    queries every table with WHERE tenant_id = $1 AND updated_at > $2
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_updated ON transactions(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_updated ON invoices(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_bills_tenant_updated ON bills(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_updated ON contacts(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_accounts_tenant_updated ON accounts(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_categories_tenant_updated ON categories(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_vendors_tenant_updated ON vendors(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_rental_agreements_tenant_updated ON rental_agreements(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_projects_tenant_updated ON projects(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_updated ON documents(tenant_id, updated_at);

-- ============================================================
-- 3. Foreign key lookup indexes (speeds up JOINs and payment flows)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_transactions_bill ON transactions(bill_id) WHERE bill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_invoice ON transactions(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_contact ON transactions(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_vendor ON transactions(vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_contact ON invoices(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bills_vendor ON bills(vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bills_contact ON bills(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_properties_building ON properties(building_id) WHERE building_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_units_property ON units(property_id) WHERE property_id IS NOT NULL;

-- ============================================================
-- 4. Session and auth indexes (speeds up middleware lookups)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_tenant ON user_sessions(user_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity ON user_sessions(last_activity);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- ============================================================
-- 5. Recurring templates and WhatsApp indexes (skip if tables don't exist yet)
-- ============================================================
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recurring_invoice_templates') THEN
        CREATE INDEX IF NOT EXISTS idx_recurring_templates_tenant ON recurring_invoice_templates(tenant_id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant ON whatsapp_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant_phone ON whatsapp_messages(tenant_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant_unread ON whatsapp_messages(tenant_id, direction, read_at) WHERE direction = 'incoming' AND read_at IS NULL;

COMMIT;
