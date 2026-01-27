-- Fix Script for Payroll Payment Account Issues
-- This script standardizes account types to match the AccountType enum

-- ============================================================================
-- BACKUP BEFORE RUNNING
-- ============================================================================
-- IMPORTANT: Create a backup before running this script!
-- Run this first: pg_dump your_database > backup_before_account_fix.sql

-- ============================================================================
-- 1. FIX ACCOUNT TYPE CASE INCONSISTENCIES
-- ============================================================================

-- Fix Bank accounts
UPDATE accounts 
SET type = 'Bank', 
    updated_at = NOW()
WHERE LOWER(type) = 'bank' 
  AND type != 'Bank';

-- Fix Cash accounts
UPDATE accounts 
SET type = 'Cash',
    updated_at = NOW()
WHERE LOWER(type) = 'cash' 
  AND type != 'Cash';

-- Fix Asset accounts
UPDATE accounts 
SET type = 'Asset',
    updated_at = NOW()
WHERE LOWER(type) = 'asset' 
  AND type != 'Asset';

-- Fix Liability accounts
UPDATE accounts 
SET type = 'Liability',
    updated_at = NOW()
WHERE LOWER(type) = 'liability' 
  AND type != 'Liability';

-- Fix Equity accounts
UPDATE accounts 
SET type = 'Equity',
    updated_at = NOW()
WHERE LOWER(type) = 'equity' 
  AND type != 'Equity';

-- ============================================================================
-- 2. CREATE MISSING SYSTEM ACCOUNTS (if needed)
-- ============================================================================

-- Note: Replace 'YOUR_TENANT_ID' with your actual tenant ID
-- You can find it by running: SELECT id FROM tenants;

-- Create missing Cash account
INSERT INTO accounts (id, tenant_id, name, type, balance, is_permanent, description, created_at, updated_at)
SELECT 
    'sys-acc-cash',
    id as tenant_id,
    'Cash',
    'Bank',
    0,
    true,
    'Default cash account',
    NOW(),
    NOW()
FROM tenants
WHERE NOT EXISTS (
    SELECT 1 FROM accounts 
    WHERE id = 'sys-acc-cash' 
    AND tenant_id = tenants.id
);

-- Create missing Accounts Receivable
INSERT INTO accounts (id, tenant_id, name, type, balance, is_permanent, description, created_at, updated_at)
SELECT 
    'sys-acc-ar',
    id as tenant_id,
    'Accounts Receivable',
    'Asset',
    0,
    true,
    'System account for unpaid invoices',
    NOW(),
    NOW()
FROM tenants
WHERE NOT EXISTS (
    SELECT 1 FROM accounts 
    WHERE id = 'sys-acc-ar' 
    AND tenant_id = tenants.id
);

-- Create missing Accounts Payable
INSERT INTO accounts (id, tenant_id, name, type, balance, is_permanent, description, created_at, updated_at)
SELECT 
    'sys-acc-ap',
    id as tenant_id,
    'Accounts Payable',
    'Liability',
    0,
    true,
    'System account for unpaid bills and salaries',
    NOW(),
    NOW()
FROM tenants
WHERE NOT EXISTS (
    SELECT 1 FROM accounts 
    WHERE id = 'sys-acc-ap' 
    AND tenant_id = tenants.id
);

-- Create missing Owner Equity
INSERT INTO accounts (id, tenant_id, name, type, balance, is_permanent, description, created_at, updated_at)
SELECT 
    'sys-acc-equity',
    id as tenant_id,
    'Owner Equity',
    'Equity',
    0,
    true,
    'System account for owner capital and equity',
    NOW(),
    NOW()
FROM tenants
WHERE NOT EXISTS (
    SELECT 1 FROM accounts 
    WHERE id = 'sys-acc-equity' 
    AND tenant_id = tenants.id
);

-- Create missing Internal Clearing
INSERT INTO accounts (id, tenant_id, name, type, balance, is_permanent, description, created_at, updated_at)
SELECT 
    'sys-acc-clearing',
    id as tenant_id,
    'Internal Clearing',
    'Bank',
    0,
    true,
    'System account for internal transfers and equity clearing',
    NOW(),
    NOW()
FROM tenants
WHERE NOT EXISTS (
    SELECT 1 FROM accounts 
    WHERE id = 'sys-acc-clearing' 
    AND tenant_id = tenants.id
);

-- ============================================================================
-- 3. VERIFY FIXES
-- ============================================================================

-- Check account types after fix
SELECT 
    'After Fix: Account Type Distribution' as info,
    type,
    COUNT(*) as count
FROM accounts
GROUP BY type
ORDER BY type;

-- Check Bank and Cash accounts
SELECT 
    'After Fix: Bank and Cash Accounts' as info,
    id,
    name,
    type,
    balance
FROM accounts
WHERE type = 'Bank' OR type = 'Cash'
ORDER BY name;

-- Check system accounts
SELECT 
    'After Fix: System Accounts' as info,
    id,
    name,
    type,
    balance,
    is_permanent
FROM accounts
WHERE is_permanent = true
ORDER BY name;

-- Check for any remaining issues
SELECT 
    'Remaining Issues' as info,
    id,
    name,
    type as invalid_type
FROM accounts
WHERE type NOT IN ('Bank', 'Cash', 'Asset', 'Liability', 'Equity');

-- ============================================================================
-- 4. ROLLBACK (if needed)
-- ============================================================================
/*
If something goes wrong, restore from backup:
psql your_database < backup_before_account_fix.sql

Or manually rollback specific changes:

-- Rollback account type changes (example)
UPDATE accounts SET type = 'BANK' WHERE type = 'Bank' AND updated_at > 'TIMESTAMP_WHEN_YOU_RAN_SCRIPT';
*/

-- ============================================================================
-- SUMMARY
-- ============================================================================
/*
This script:
1. Standardizes all account types to proper case (Bank, Cash, Asset, Liability, Equity)
2. Creates any missing system accounts
3. Verifies the fixes
4. Shows any remaining issues

After running this script:
- All bank accounts should have type = 'Bank' (not 'BANK' or 'bank')
- All cash accounts should have type = 'Cash' (not 'CASH' or 'cash')
- System accounts should exist for all tenants
- Payroll dropdown should show all Bank and Cash accounts

Expected Results:
- "After Fix: Bank and Cash Accounts" should show ALL your bank accounts
- "Remaining Issues" should be empty
- Payroll payment dropdown should now show all accounts
*/
