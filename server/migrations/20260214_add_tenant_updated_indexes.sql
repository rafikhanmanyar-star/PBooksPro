-- Migration: Add composite indexes (tenant_id, updated_at) for state sync
-- Date: 2026-02-14
-- Description: Completes composite indexes for all tables used by /api/state/changes.
--              The 20260210 migration added some; this adds the remaining ones.
--              Query pattern: WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC

BEGIN;

-- Buildings, properties, units
CREATE INDEX IF NOT EXISTS idx_buildings_tenant_updated ON buildings(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_properties_tenant_updated ON properties(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_units_tenant_updated ON units(tenant_id, updated_at);

-- Budgets, contracts, sales_returns, quotations
CREATE INDEX IF NOT EXISTS idx_budgets_tenant_updated ON budgets(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant_updated ON contracts(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_sales_returns_tenant_updated ON sales_returns(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_quotations_tenant_updated ON quotations(tenant_id, updated_at);

-- Project agreements, installment plans, pm_cycle_allocations
CREATE INDEX IF NOT EXISTS idx_project_agreements_tenant_updated ON project_agreements(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_installment_plans_tenant_updated ON installment_plans(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_pm_cycle_allocations_tenant_updated ON pm_cycle_allocations(tenant_id, updated_at);

-- Plan amenities (if table exists)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plan_amenities') THEN
        CREATE INDEX IF NOT EXISTS idx_plan_amenities_tenant_updated ON plan_amenities(tenant_id, updated_at);
    END IF;
END $$;

-- Recurring invoice templates (if table exists)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recurring_invoice_templates') THEN
        CREATE INDEX IF NOT EXISTS idx_recurring_invoice_templates_tenant_updated ON recurring_invoice_templates(tenant_id, updated_at);
    END IF;
END $$;

-- Inventory and warehouses (if tables exist)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inventory_items') THEN
        CREATE INDEX IF NOT EXISTS idx_inventory_items_tenant_updated ON inventory_items(tenant_id, updated_at);
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'warehouses') THEN
        CREATE INDEX IF NOT EXISTS idx_warehouses_tenant_updated ON warehouses(tenant_id, updated_at);
    END IF;
END $$;

COMMIT;
