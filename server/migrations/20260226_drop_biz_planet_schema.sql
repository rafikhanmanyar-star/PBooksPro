-- DROP BIZ PLANET SCHEMA
-- WARNING: This migration DROPS data. Run manually on staging first. Do NOT add to auto-run.
-- Run only when intentionally removing the Biz Planet module.

-- Drop in dependency order (child tables first)
DROP TABLE IF EXISTS p2p_audit_trail CASCADE;
DROP TABLE IF EXISTS p2p_bills CASCADE;
DROP TABLE IF EXISTS p2p_invoices CASCADE;
DROP TABLE IF EXISTS purchase_orders CASCADE;
DROP TABLE IF EXISTS registered_suppliers CASCADE;
DROP TABLE IF EXISTS supplier_registration_requests CASCADE;
DROP TABLE IF EXISTS marketplace_ads CASCADE;
DROP TABLE IF EXISTS marketplace_categories CASCADE;
