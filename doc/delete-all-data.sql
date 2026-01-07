-- ============================================================================
-- SQL Script to Delete All Data from PostgreSQL Database
-- ============================================================================
-- WARNING: This script will DELETE ALL DATA from all tables in the database.
-- This action is IRREVERSIBLE. Use with extreme caution!
-- 
-- Usage: Run this script as a database superuser or owner.
-- ============================================================================

-- Disable Row Level Security temporarily to allow bulk deletion
-- (This is safe since we're deleting everything anyway)

-- Start transaction for safety (can rollback if needed)
BEGIN;

-- ============================================================================
-- DELETE ALL DATA FROM ALL TABLES
-- ============================================================================
-- Using TRUNCATE CASCADE to handle foreign key constraints automatically
-- Tables are truncated in reverse dependency order to avoid constraint issues

-- Payment and subscription related tables
TRUNCATE TABLE subscriptions CASCADE;
TRUNCATE TABLE payment_webhooks CASCADE;
TRUNCATE TABLE payments CASCADE;

-- Audit and session tables
TRUNCATE TABLE transaction_audit_log CASCADE;
TRUNCATE TABLE user_sessions CASCADE;

-- Financial transaction tables
TRUNCATE TABLE transactions CASCADE;
TRUNCATE TABLE invoices CASCADE;
TRUNCATE TABLE bills CASCADE;
TRUNCATE TABLE budgets CASCADE;

-- Agreement and contract tables
TRUNCATE TABLE rental_agreements CASCADE;
TRUNCATE TABLE project_agreements CASCADE;
TRUNCATE TABLE contracts CASCADE;

-- Property management tables
TRUNCATE TABLE units CASCADE;
TRUNCATE TABLE properties CASCADE;
TRUNCATE TABLE buildings CASCADE;
TRUNCATE TABLE projects CASCADE;

-- Core financial tables
TRUNCATE TABLE categories CASCADE;
TRUNCATE TABLE contacts CASCADE;
TRUNCATE TABLE accounts CASCADE;

-- User and tenant tables
TRUNCATE TABLE users CASCADE;
TRUNCATE TABLE license_history CASCADE;
TRUNCATE TABLE license_keys CASCADE;
TRUNCATE TABLE tenants CASCADE;

-- Admin users table (separate from tenant users)
TRUNCATE TABLE admin_users CASCADE;

-- ============================================================================
-- ALTERNATIVE: If TRUNCATE doesn't work due to permissions or constraints,
-- use DELETE statements instead (uncomment below and comment out TRUNCATE above)
-- ============================================================================

/*
-- Delete in order to respect foreign key constraints

-- Payment and subscription related
DELETE FROM subscriptions;
DELETE FROM payment_webhooks;
DELETE FROM payments;

-- Audit and session tables
DELETE FROM transaction_audit_log;
DELETE FROM user_sessions;

-- Financial transaction tables
DELETE FROM transactions;
DELETE FROM invoices;
DELETE FROM bills;
DELETE FROM budgets;

-- Agreement and contract tables
DELETE FROM rental_agreements;
DELETE FROM project_agreements;
DELETE FROM contracts;

-- Property management tables
DELETE FROM units;
DELETE FROM properties;
DELETE FROM buildings;
DELETE FROM projects;

-- Core financial tables
DELETE FROM categories;
DELETE FROM contacts;
DELETE FROM accounts;

-- User and tenant tables
DELETE FROM users;
DELETE FROM license_history;
DELETE FROM license_keys;
DELETE FROM tenants;

-- Admin users table
DELETE FROM admin_users;
*/

-- ============================================================================
-- VERIFICATION: Check that all tables are empty
-- ============================================================================
-- Uncomment the following to verify deletion (run after COMMIT)

/*
SELECT 
    schemaname,
    tablename,
    n_tup_ins as row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY tablename;
*/

-- Commit the transaction
COMMIT;

-- ============================================================================
-- NOTES:
-- ============================================================================
-- 1. This script preserves table structures, indexes, and constraints
-- 2. Sequences are NOT reset by default. To reset sequences, add:
--    RESTART IDENTITY to each TRUNCATE statement
-- 3. If you need to reset sequences, use:
--    TRUNCATE TABLE table_name RESTART IDENTITY CASCADE;
-- 4. Row Level Security policies remain intact
-- 5. To completely drop all tables and recreate schema, use the schema file instead
-- ============================================================================

