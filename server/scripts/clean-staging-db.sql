-- =====================================================
-- Clean Staging Database - Remove All Data Except WhatsApp Tables
-- =====================================================
-- 
-- ⚠️ WARNING: This script will permanently delete all data from the database!
-- 
-- This script will:
--   - Preserve WhatsApp tables (whatsapp_configs, whatsapp_messages)
--   - Truncate all other tables in the public schema
-- 
-- ⚠️ IMPORTANT: 
--   - Only run this on STAGING database, NOT production!
--   - Make sure you have backups if needed
--   - WhatsApp tables will be preserved automatically
--
-- Usage in DBeaver:
--   1. Connect to your STAGING database
--   2. Review the tables that will be cleaned below
--   3. Uncomment the TRUNCATE statements to execute
--   4. Or run the dynamic SQL at the bottom
-- =====================================================

-- First, let's see what tables exist and their row counts
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Show row counts for all tables (this helps you see what will be deleted)
-- Uncomment to see row counts:
/*
DO $$
DECLARE
    r RECORD;
    row_count INTEGER;
BEGIN
    FOR r IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
    LOOP
        EXECUTE format('SELECT COUNT(*) FROM %I', r.table_name) INTO row_count;
        RAISE NOTICE 'Table: % | Rows: %', r.table_name, row_count;
    END LOOP;
END $$;
*/

-- =====================================================
-- WhatsApp Tables (PRESERVED - DO NOT TRUNCATE)
-- =====================================================
-- whatsapp_configs
-- whatsapp_messages
-- Any table with 'whatsapp' in the name

-- =====================================================
-- Manual TRUNCATE Statements (Option 1)
-- =====================================================
-- Uncomment the tables you want to clean, or use the dynamic SQL below
-- All TRUNCATE statements use CASCADE to handle foreign key constraints

-- Example (uncomment to use):
/*
TRUNCATE TABLE accounts CASCADE;
TRUNCATE TABLE contacts CASCADE;
TRUNCATE TABLE transactions CASCADE;
TRUNCATE TABLE invoices CASCADE;
TRUNCATE TABLE projects CASCADE;
TRUNCATE TABLE properties CASCADE;
TRUNCATE TABLE units CASCADE;
TRUNCATE TABLE buildings CASCADE;
TRUNCATE TABLE categories CASCADE;
TRUNCATE TABLE budgets CASCADE;
TRUNCATE TABLE rental_agreements CASCADE;
TRUNCATE TABLE project_agreements CASCADE;
TRUNCATE TABLE project_contracts CASCADE;
TRUNCATE TABLE bills CASCADE;
TRUNCATE TABLE purchase_bills CASCADE;
TRUNCATE TABLE purchase_orders CASCADE;
TRUNCATE TABLE quotations CASCADE;
TRUNCATE TABLE inventory_items CASCADE;
TRUNCATE TABLE payroll_runs CASCADE;
TRUNCATE TABLE payroll_employees CASCADE;
TRUNCATE TABLE tasks CASCADE;
TRUNCATE TABLE p2p_bills CASCADE;
TRUNCATE TABLE p2p_invoices CASCADE;
TRUNCATE TABLE audit_logs CASCADE;
TRUNCATE TABLE app_settings CASCADE;
TRUNCATE TABLE users CASCADE;
TRUNCATE TABLE tenants CASCADE;
TRUNCATE TABLE license_keys CASCADE;
TRUNCATE TABLE admin_users CASCADE;
-- Add more tables as needed
*/

-- =====================================================
-- Dynamic SQL - Automatically Clean All Tables Except WhatsApp (Option 2)
-- =====================================================
-- This will automatically truncate all tables except WhatsApp tables
-- Uncomment the block below to execute

/*
DO $$
DECLARE
    r RECORD;
    whatsapp_tables TEXT[] := ARRAY['whatsapp_configs', 'whatsapp_messages'];
    is_whatsapp BOOLEAN;
    cleaned_count INTEGER := 0;
    preserved_count INTEGER := 0;
BEGIN
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'Starting database cleanup...';
    RAISE NOTICE 'WhatsApp tables will be preserved';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE '';
    
    -- Loop through all tables
    FOR r IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
    LOOP
        -- Check if this is a WhatsApp table
        is_whatsapp := FALSE;
        
        -- Check exact match
        IF r.table_name = ANY(whatsapp_tables) THEN
            is_whatsapp := TRUE;
        END IF;
        
        -- Check if name contains 'whatsapp' (case insensitive)
        IF LOWER(r.table_name) LIKE '%whatsapp%' THEN
            is_whatsapp := TRUE;
        END IF;
        
        -- Preserve WhatsApp tables, clean others
        IF is_whatsapp THEN
            RAISE NOTICE 'PRESERVED: %', r.table_name;
            preserved_count := preserved_count + 1;
        ELSE
            BEGIN
                EXECUTE format('TRUNCATE TABLE %I CASCADE', r.table_name);
                RAISE NOTICE 'CLEANED: %', r.table_name;
                cleaned_count := cleaned_count + 1;
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'ERROR cleaning %: %', r.table_name, SQLERRM;
            END;
        END IF;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'Cleanup completed!';
    RAISE NOTICE 'Cleaned: % table(s)', cleaned_count;
    RAISE NOTICE 'Preserved: % WhatsApp table(s)', preserved_count;
    RAISE NOTICE '=====================================================';
END $$;
*/

-- =====================================================
-- Verification Queries
-- =====================================================

-- Verify WhatsApp tables still have data (run after cleanup)
SELECT 
    'whatsapp_configs' as table_name,
    COUNT(*) as row_count
FROM whatsapp_configs
UNION ALL
SELECT 
    'whatsapp_messages' as table_name,
    COUNT(*) as row_count
FROM whatsapp_messages;

-- List all tables and their row counts after cleanup
SELECT 
    table_name,
    (xpath('/row/c/text()', query_to_xml(format('SELECT COUNT(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text::int AS row_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- =====================================================
-- Quick Clean Script (Copy and paste this to execute immediately)
-- =====================================================
-- Uncomment the entire block below to run the cleanup

/*
-- START CLEANUP
DO $$
DECLARE
    r RECORD;
    cleaned_count INTEGER := 0;
    preserved_count INTEGER := 0;
BEGIN
    FOR r IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          AND table_name NOT IN ('whatsapp_configs', 'whatsapp_messages')
          AND LOWER(table_name) NOT LIKE '%whatsapp%'
        ORDER BY table_name
    LOOP
        BEGIN
            EXECUTE format('TRUNCATE TABLE %I CASCADE', r.table_name);
            cleaned_count := cleaned_count + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Error cleaning %: %', r.table_name, SQLERRM;
        END;
    END LOOP;
    
    -- Count preserved tables
    SELECT COUNT(*) INTO preserved_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND (table_name IN ('whatsapp_configs', 'whatsapp_messages') 
           OR LOWER(table_name) LIKE '%whatsapp%');
    
    RAISE NOTICE 'Cleanup complete! Cleaned: % tables, Preserved: % WhatsApp tables', cleaned_count, preserved_count;
END $$;
-- END CLEANUP
*/
