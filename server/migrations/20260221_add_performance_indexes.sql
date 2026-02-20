-- Migration: Performance optimization indexes
-- Date: 2026-02-21
-- Description: Adds missing indexes identified in performance audit:
--   1. user_sessions.token — queried on every authenticated request via tenantMiddleware
--   2. transactions(tenant_id, date) — date-range queries on transactions
--   3. invoices/bills(tenant_id, issue_date) — ordering/filtering by issue_date
--   4. transaction_audit_log(tenant_id, created_at) — audit log pagination
--   5. Composite (tenant_id, deleted_at) — covers soft-delete filtering pattern
--   6. Missing FK join indexes (tasks, purchase_orders, p2p_invoices)

BEGIN;

-- 1. Session token lookup (critical path: every authenticated API request)
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);

-- 2. Transaction date range queries
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_date ON transactions(tenant_id, date);

-- 3. Invoice/bill date ordering
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_issue_date ON invoices(tenant_id, issue_date);
CREATE INDEX IF NOT EXISTS idx_bills_tenant_issue_date ON bills(tenant_id, issue_date);

-- 4. Audit log pagination
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transaction_audit_log') THEN
        CREATE INDEX IF NOT EXISTS idx_transaction_audit_tenant_created ON transaction_audit_log(tenant_id, created_at);
    END IF;
END $$;

-- 5. Composite (tenant_id, deleted_at) for soft-delete filtering
CREATE INDEX IF NOT EXISTS idx_accounts_tenant_deleted ON accounts(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_deleted ON contacts(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_vendors_tenant_deleted ON vendors(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_categories_tenant_deleted ON categories(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_projects_tenant_deleted ON projects(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_buildings_tenant_deleted ON buildings(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_properties_tenant_deleted ON properties(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_units_tenant_deleted ON units(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_deleted ON transactions(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_deleted ON invoices(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_bills_tenant_deleted ON bills(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_budgets_tenant_deleted ON budgets(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_quotations_tenant_deleted ON quotations(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_deleted ON documents(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant_deleted ON contracts(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_rental_agreements_tenant_deleted ON rental_agreements(org_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_project_agreements_tenant_deleted ON project_agreements(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_sales_returns_tenant_deleted ON sales_returns(tenant_id, deleted_at);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'installment_plans') THEN
        CREATE INDEX IF NOT EXISTS idx_installment_plans_tenant_deleted ON installment_plans(tenant_id, deleted_at);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recurring_invoice_templates') THEN
        CREATE INDEX IF NOT EXISTS idx_recurring_templates_tenant_deleted ON recurring_invoice_templates(tenant_id, deleted_at);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pm_cycle_allocations') THEN
        CREATE INDEX IF NOT EXISTS idx_pm_cycle_allocations_tenant_deleted ON pm_cycle_allocations(tenant_id, deleted_at);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plan_amenities') THEN
        CREATE INDEX IF NOT EXISTS idx_plan_amenities_tenant_deleted ON plan_amenities(tenant_id, deleted_at);
    END IF;
END $$;

-- 6. Missing FK/join indexes
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tasks') THEN
        CREATE INDEX IF NOT EXISTS idx_tasks_owner_id ON tasks(owner_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_initiative_id ON tasks(initiative_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'purchase_orders') THEN
        CREATE INDEX IF NOT EXISTS idx_purchase_orders_project_id ON purchase_orders(project_id);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'p2p_invoices') THEN
        CREATE INDEX IF NOT EXISTS idx_p2p_invoices_po_id_idx ON p2p_invoices(po_id);
    END IF;
END $$;

-- 7. Payroll joining date (used in payroll queries)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payroll_employees') THEN
        CREATE INDEX IF NOT EXISTS idx_payroll_employees_joining_date ON payroll_employees(tenant_id, joining_date);
    END IF;
END $$;

COMMIT;
