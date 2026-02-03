-- Robust SQL Script to remove all shop and inventory related tables
-- This script uses CASCADE to handle foreign key dependencies automatically
-- Works on PostgreSQL, and fallback logic is included for SQLite.

-- ============================================================================
-- 1. CLEANUP WITH CASCADE (Best for PostgreSQL)
-- ============================================================================

-- Drop Shop tables with CASCADE
DROP TABLE IF EXISTS my_shop_sales_returns CASCADE;
DROP TABLE IF EXISTS shop_sale_items CASCADE;
DROP TABLE IF EXISTS shop_sales CASCADE;
DROP TABLE IF EXISTS shop_config CASCADE;

-- Drop Inventory tables with CASCADE
DROP TABLE IF EXISTS purchase_bill_items CASCADE;
DROP TABLE IF EXISTS purchase_bill_payments CASCADE;
DROP TABLE IF EXISTS inventory_stock CASCADE;
DROP TABLE IF EXISTS purchase_bills CASCADE;
DROP TABLE IF EXISTS inventory_items CASCADE;
DROP TABLE IF EXISTS warehouses CASCADE;

-- ============================================================================
-- 2. REORDERED DROPS (Fallback for SQLite/Others)
-- ============================================================================
-- If CASCADE is not supported, the order below ensures children are dropped first.

-- PRAGMA foreign_keys = OFF; -- SQLite specific

-- Child Tables (Detail/Transaction tables)
-- DROP TABLE IF EXISTS my_shop_sales_returns;
-- DROP TABLE IF EXISTS shop_sale_items;
-- DROP TABLE IF EXISTS purchase_bill_items;
-- DROP TABLE IF EXISTS purchase_bill_payments;
-- DROP TABLE IF EXISTS inventory_stock;

-- Parent Tables
-- DROP TABLE IF EXISTS shop_sales;
-- DROP TABLE IF EXISTS purchase_bills;
-- DROP TABLE IF EXISTS inventory_items;
-- DROP TABLE IF EXISTS warehouses;
-- DROP TABLE IF EXISTS shop_config;

-- PRAGMA foreign_keys = ON;

-- ============================================================================
-- 3. PROCUREMENT (P2P) TABLES (Optional - Uncomment to remove)
-- ============================================================================
-- DROP TABLE IF EXISTS p2p_audit_trail CASCADE;
-- DROP TABLE IF EXISTS p2p_bills CASCADE;
-- DROP TABLE IF EXISTS p2p_invoices CASCADE;
-- DROP TABLE IF EXISTS purchase_orders CASCADE;
-- DROP TABLE IF EXISTS registered_suppliers CASCADE;
-- DROP TABLE IF EXISTS supplier_registration_requests CASCADE;
