
-- Migration: Add RLS Policies for Shop Tables
-- Ensures tenant isolation for all retail/POS entities

DO $$ 
BEGIN
    -- shop_branches
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shop_branches' AND policyname = 'tenant_isolation_shop_branches') THEN
        CREATE POLICY tenant_isolation_shop_branches ON shop_branches
            FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());
    END IF;

    -- shop_terminals
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shop_terminals' AND policyname = 'tenant_isolation_shop_terminals') THEN
        CREATE POLICY tenant_isolation_shop_terminals ON shop_terminals
            FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());
    END IF;

    -- shop_warehouses
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shop_warehouses' AND policyname = 'tenant_isolation_shop_warehouses') THEN
        CREATE POLICY tenant_isolation_shop_warehouses ON shop_warehouses
            FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());
    END IF;

    -- shop_products
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shop_products' AND policyname = 'tenant_isolation_shop_products') THEN
        CREATE POLICY tenant_isolation_shop_products ON shop_products
            FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());
    END IF;

    -- shop_inventory
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shop_inventory' AND policyname = 'tenant_isolation_shop_inventory') THEN
        CREATE POLICY tenant_isolation_shop_inventory ON shop_inventory
            FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());
    END IF;

    -- shop_loyalty_members
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shop_loyalty_members' AND policyname = 'tenant_isolation_shop_loyalty_members') THEN
        CREATE POLICY tenant_isolation_shop_loyalty_members ON shop_loyalty_members
            FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());
    END IF;

    -- shop_sales
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shop_sales' AND policyname = 'tenant_isolation_shop_sales') THEN
        CREATE POLICY tenant_isolation_shop_sales ON shop_sales
            FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());
    END IF;

    -- shop_sale_items
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shop_sale_items' AND policyname = 'tenant_isolation_shop_sale_items') THEN
        CREATE POLICY tenant_isolation_shop_sale_items ON shop_sale_items
            FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());
    END IF;

    -- shop_inventory_movements
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shop_inventory_movements' AND policyname = 'tenant_isolation_shop_inventory_movements') THEN
        CREATE POLICY tenant_isolation_shop_inventory_movements ON shop_inventory_movements
            FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());
    END IF;

END $$;
