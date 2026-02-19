-- Migration: Remove shop module tables
-- The shop functionality has been moved to the standalone MyShop application

-- Drop indexes first
DROP INDEX IF EXISTS idx_shop_sales_tenant;
DROP INDEX IF EXISTS idx_shop_sales_branch;
DROP INDEX IF EXISTS idx_shop_sale_items_sale;
DROP INDEX IF EXISTS idx_shop_products_tenant;
DROP INDEX IF EXISTS idx_shop_products_sku;
DROP INDEX IF EXISTS idx_shop_inventory_product;
DROP INDEX IF EXISTS idx_shop_inventory_warehouse;
DROP INDEX IF EXISTS idx_shop_loyalty_customer;
DROP INDEX IF EXISTS idx_shop_loyalty_tenant;
DROP INDEX IF EXISTS idx_shop_branches_tenant;
DROP INDEX IF EXISTS idx_shop_terminals_branch;
DROP INDEX IF EXISTS idx_shop_warehouses_tenant;
DROP INDEX IF EXISTS idx_shop_inventory_movements_product;

-- Drop child tables first (respecting foreign key constraints)
DROP TABLE IF EXISTS shop_sale_items CASCADE;
DROP TABLE IF EXISTS shop_inventory_movements CASCADE;
DROP TABLE IF EXISTS shop_sales CASCADE;
DROP TABLE IF EXISTS shop_inventory CASCADE;
DROP TABLE IF EXISTS shop_loyalty_members CASCADE;
DROP TABLE IF EXISTS shop_products CASCADE;
DROP TABLE IF EXISTS shop_terminals CASCADE;
DROP TABLE IF EXISTS shop_warehouses CASCADE;
DROP TABLE IF EXISTS shop_branches CASCADE;
DROP TABLE IF EXISTS shop_policies CASCADE;