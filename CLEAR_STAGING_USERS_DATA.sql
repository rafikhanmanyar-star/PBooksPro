/*******************************************************************************
 * PBooksPro - STAGING DATABASE REFRESH SCRIPT (Safe Version)
 * 
 * Description: Clears all user-created data for fresh testing.
 * Tool: Use this in DBeaver or any SQL client connected to the staging DB.
 * 
 * NOTE: This version does not require superuser permissions.
 * WARNING: This script is DESTRUCTIVE. Run only on Staging, never on Production.
 ******************************************************************************/

BEGIN;

-- 1. CLEAR OPERATIONAL DATA (Transactions, History, Logins)
-- TRUNCATE CASCADE will handle foreign key dependencies automatically
TRUNCATE TABLE 
    transactions,
    payments,
    invoices,
    bills,
    quotations,
    user_sessions,
    tasks,
    shop_sales,
    investments
CASCADE;

-- 2. CLEAR MASTER DATA & PROJECT STRUCTURE
TRUNCATE TABLE 
    rental_agreements,
    project_agreements,
    installment_plans,
    contracts,
    units,
    properties,
    buildings,
    projects,
    contacts,
    vendors,
    inventory_batches,
    purchase_orders,
    p2p_invoices
CASCADE;

-- 3. CLEAR PAYROLL DATA
TRUNCATE TABLE 
    payslips,
    payroll_runs,
    payroll_employees,
    payroll_departments,
    payroll_grades,
    payroll_salary_components
CASCADE;

-- 4. CLEAR PRODUCT CATALOG
TRUNCATE TABLE 
    shop_products,
    shop_branches
CASCADE;

-- 5. RESET FINANCIAL ACCOUNTS
TRUNCATE TABLE accounts CASCADE;

-- 6. RESET SEQUENCES (Restarts IDs from 1)
-- We use a safer way to reset sequences that doesn't usually require superuser
DO $$ 
DECLARE
    seq RECORD;
BEGIN
    FOR seq IN 
        SELECT n.nspname as schema_name, c.relname as sequence_name
        FROM pg_class c 
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'S' 
        AND n.nspname = 'public'
        AND c.relname NOT LIKE 'schema_migrations%'
    LOOP
        EXECUTE format('ALTER SEQUENCE %I.%I RESTART WITH 1', seq.schema_name, seq.sequence_name);
    END LOOP;
END $$;

-- 7. CLEANUP USERS & TENANTS (Optional)
-- Uncomment below if you want to wipe all registered users and tenants
-- TRUNCATE TABLE users CASCADE;
-- TRUNCATE TABLE tenants CASCADE;

COMMIT;

-- 8. VERIFICATION
SELECT 
    (SELECT COUNT(*) FROM transactions) as transactions,
    (SELECT COUNT(*) FROM invoices) as invoices,
    (SELECT COUNT(*) FROM contacts) as contacts,
    (SELECT COUNT(*) FROM projects) as projects,
    (SELECT COUNT(*) FROM payroll_employees) as employees,
    (SELECT COUNT(*) FROM tenants) as tenants_remaining,
    (SELECT COUNT(*) FROM users) as users_remaining;

