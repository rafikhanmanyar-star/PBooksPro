-- Diagnostic Script for Payroll Payment Account Issues
-- Run this to diagnose why bank accounts are not showing in payroll payment dropdown

-- ============================================================================
-- 1. CHECK ALL ACCOUNTS
-- ============================================================================
SELECT 
    '=== ALL ACCOUNTS ===' as section,
    id,
    name,
    type,
    balance,
    is_permanent,
    created_at
FROM accounts
WHERE tenant_id = (SELECT id FROM tenants LIMIT 1)
ORDER BY name;

-- ============================================================================
-- 2. CHECK ACCOUNT TYPE VARIATIONS
-- ============================================================================
SELECT 
    '=== ACCOUNT TYPE VARIATIONS ===' as section,
    type as original_type,
    LOWER(type) as lowercase_type,
    COUNT(*) as count
FROM accounts
WHERE tenant_id = (SELECT id FROM tenants LIMIT 1)
GROUP BY type
ORDER BY type;

-- ============================================================================
-- 3. CHECK BANK AND CASH ACCOUNTS (case-sensitive)
-- ============================================================================
SELECT 
    '=== BANK AND CASH ACCOUNTS (Exact Match) ===' as section,
    id,
    name,
    type,
    balance,
    is_permanent
FROM accounts
WHERE tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND (type = 'Bank' OR type = 'Cash')
ORDER BY name;

-- ============================================================================
-- 4. CHECK BANK AND CASH ACCOUNTS (case-insensitive)
-- ============================================================================
SELECT 
    '=== BANK AND CASH ACCOUNTS (Case-Insensitive) ===' as section,
    id,
    name,
    type,
    balance,
    is_permanent
FROM accounts
WHERE tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND (LOWER(type) = 'bank' OR LOWER(type) = 'cash')
ORDER BY name;

-- ============================================================================
-- 5. CHECK SYSTEM ACCOUNTS
-- ============================================================================
SELECT 
    '=== SYSTEM ACCOUNTS ===' as section,
    id,
    name,
    type,
    balance,
    is_permanent,
    CASE 
        WHEN id = 'sys-acc-cash' THEN '✓ Cash Account'
        WHEN id = 'sys-acc-ar' THEN '✓ Accounts Receivable'
        WHEN id = 'sys-acc-ap' THEN '✓ Accounts Payable'
        WHEN id = 'sys-acc-equity' THEN '✓ Owner Equity'
        WHEN id = 'sys-acc-clearing' THEN '✓ Internal Clearing (Should be excluded from payroll)'
        ELSE '? Unknown System Account'
    END as system_account_type
FROM accounts
WHERE tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND is_permanent = true
ORDER BY name;

-- ============================================================================
-- 6. CHECK FOR MISSING SYSTEM ACCOUNTS
-- ============================================================================
SELECT 
    '=== MISSING SYSTEM ACCOUNTS ===' as section,
    missing_account
FROM (
    VALUES 
        ('sys-acc-cash'),
        ('sys-acc-ar'),
        ('sys-acc-ap'),
        ('sys-acc-equity'),
        ('sys-acc-clearing')
) AS expected(missing_account)
WHERE NOT EXISTS (
    SELECT 1 FROM accounts 
    WHERE id = expected.missing_account 
    AND tenant_id = (SELECT id FROM tenants LIMIT 1)
);

-- ============================================================================
-- 7. CHECK ACCOUNTS WITH WRONG CASE
-- ============================================================================
SELECT 
    '=== ACCOUNTS WITH WRONG TYPE CASE ===' as section,
    id,
    name,
    type as wrong_case_type,
    CASE 
        WHEN LOWER(type) = 'bank' THEN 'Bank'
        WHEN LOWER(type) = 'cash' THEN 'Cash'
        WHEN LOWER(type) = 'asset' THEN 'Asset'
        WHEN LOWER(type) = 'liability' THEN 'Liability'
        WHEN LOWER(type) = 'equity' THEN 'Equity'
        ELSE type
    END as should_be_type
FROM accounts
WHERE tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND type NOT IN ('Bank', 'Cash', 'Asset', 'Liability', 'Equity');

-- ============================================================================
-- 8. CHECK RECENTLY CREATED ACCOUNTS
-- ============================================================================
SELECT 
    '=== RECENTLY CREATED ACCOUNTS (Last 30 days) ===' as section,
    id,
    name,
    type,
    balance,
    created_at,
    EXTRACT(DAY FROM (NOW() - created_at)) as days_old
FROM accounts
WHERE tenant_id = (SELECT id FROM tenants LIMIT 1)
  AND created_at > NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;

-- ============================================================================
-- 9. SUMMARY
-- ============================================================================
SELECT 
    '=== ACCOUNT SUMMARY ===' as section,
    COUNT(*) as total_accounts,
    COUNT(*) FILTER (WHERE type = 'Bank' OR type = 'Cash') as exact_bank_cash_count,
    COUNT(*) FILTER (WHERE LOWER(type) = 'bank' OR LOWER(type) = 'cash') as case_insensitive_bank_cash_count,
    COUNT(*) FILTER (WHERE name = 'Internal Clearing') as internal_clearing_count,
    COUNT(*) FILTER (WHERE is_permanent = true) as system_accounts_count,
    COUNT(*) FILTER (WHERE type NOT IN ('Bank', 'Cash', 'Asset', 'Liability', 'Equity')) as wrong_type_count
FROM accounts
WHERE tenant_id = (SELECT id FROM tenants LIMIT 1);

-- ============================================================================
-- EXPECTED RESULTS
-- ============================================================================
/*
Expected Results:

1. ALL ACCOUNTS: Should show all your accounts
2. TYPE VARIATIONS: Should only show 'Bank', 'Cash', 'Asset', 'Liability', 'Equity'
   - If you see 'BANK', 'bank', etc., that's the problem!
3. BANK AND CASH (Exact): Accounts shown here will appear in payroll dropdown
4. BANK AND CASH (Case-Insensitive): More accounts? You have case inconsistency!
5. SYSTEM ACCOUNTS: Should have 5 system accounts
6. MISSING SYSTEM ACCOUNTS: Should be empty (all system accounts exist)
7. WRONG CASE: Should be empty (no accounts with wrong case)
8. RECENTLY CREATED: Shows which account was just added
9. SUMMARY: 
   - exact_bank_cash_count = accounts visible in payroll dropdown
   - case_insensitive_bank_cash_count = total bank/cash accounts (including wrong case)
   - If these numbers are different, you have case issues!

*/
