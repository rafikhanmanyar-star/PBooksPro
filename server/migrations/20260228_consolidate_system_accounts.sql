-- Migration: Consolidate duplicate system accounts
-- Problem: Some tenant-scoped accounts were created with the same name as global system accounts
-- (e.g. tenant-scoped "Cash" accounts alongside the global sys-acc-cash).
-- This was caused by old validation code that only checked tenant_id = $1 instead of
-- (tenant_id = $1 OR tenant_id IS NULL), so it missed the global system account and
-- created a tenant-scoped duplicate.
--
-- This migration:
-- 1. Reassigns all transaction references from duplicate tenant-scoped accounts to the global system account
-- 2. Transfers balances from duplicate accounts to the global system account
-- 3. Soft-deletes the duplicate tenant-scoped accounts

-- Ensure the global system accounts exist first
INSERT INTO accounts (id, tenant_id, name, type, balance, is_permanent, description, created_at, updated_at)
VALUES 
  ('sys-acc-cash', NULL, 'Cash', 'Bank', 0, TRUE, 'Default cash account', NOW(), NOW()),
  ('sys-acc-ar', NULL, 'Accounts Receivable', 'Asset', 0, TRUE, 'System account for unpaid invoices', NOW()),
  ('sys-acc-ap', NULL, 'Accounts Payable', 'Liability', 0, TRUE, 'System account for unpaid bills and salaries', NOW()),
  ('sys-acc-equity', NULL, 'Owner Equity', 'Equity', 0, TRUE, 'System account for owner capital and equity', NOW()),
  ('sys-acc-clearing', NULL, 'Internal Clearing', 'Bank', 0, TRUE, 'System account for internal transfers and equity clearing', NOW())
ON CONFLICT (id) DO NOTHING;

-- For each system account name, find tenant-scoped duplicates and consolidate them

-- ============================================================================
-- STEP 1: Reassign transaction references from duplicates → global system accounts
-- ============================================================================

-- Cash duplicates → sys-acc-cash
UPDATE transactions SET account_id = 'sys-acc-cash'
WHERE account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL 
    AND LOWER(TRIM(name)) = 'cash' 
    AND id != 'sys-acc-cash'
    AND (is_permanent = TRUE OR type = 'Bank')
);

UPDATE transactions SET from_account_id = 'sys-acc-cash'
WHERE from_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL 
    AND LOWER(TRIM(name)) = 'cash' 
    AND id != 'sys-acc-cash'
    AND (is_permanent = TRUE OR type = 'Bank')
);

UPDATE transactions SET to_account_id = 'sys-acc-cash'
WHERE to_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL 
    AND LOWER(TRIM(name)) = 'cash' 
    AND id != 'sys-acc-cash'
    AND (is_permanent = TRUE OR type = 'Bank')
);

-- Accounts Receivable duplicates → sys-acc-ar
UPDATE transactions SET account_id = 'sys-acc-ar'
WHERE account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL 
    AND LOWER(TRIM(name)) = 'accounts receivable' 
    AND id != 'sys-acc-ar'
    AND is_permanent = TRUE
);

UPDATE transactions SET from_account_id = 'sys-acc-ar'
WHERE from_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL 
    AND LOWER(TRIM(name)) = 'accounts receivable' 
    AND id != 'sys-acc-ar'
    AND is_permanent = TRUE
);

UPDATE transactions SET to_account_id = 'sys-acc-ar'
WHERE to_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL 
    AND LOWER(TRIM(name)) = 'accounts receivable' 
    AND id != 'sys-acc-ar'
    AND is_permanent = TRUE
);

-- Accounts Payable duplicates → sys-acc-ap
UPDATE transactions SET account_id = 'sys-acc-ap'
WHERE account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL 
    AND LOWER(TRIM(name)) = 'accounts payable' 
    AND id != 'sys-acc-ap'
    AND is_permanent = TRUE
);

UPDATE transactions SET from_account_id = 'sys-acc-ap'
WHERE from_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL 
    AND LOWER(TRIM(name)) = 'accounts payable' 
    AND id != 'sys-acc-ap'
    AND is_permanent = TRUE
);

UPDATE transactions SET to_account_id = 'sys-acc-ap'
WHERE to_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL 
    AND LOWER(TRIM(name)) = 'accounts payable' 
    AND id != 'sys-acc-ap'
    AND is_permanent = TRUE
);

-- Owner Equity duplicates → sys-acc-equity
UPDATE transactions SET account_id = 'sys-acc-equity'
WHERE account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL 
    AND LOWER(TRIM(name)) = 'owner equity' 
    AND id != 'sys-acc-equity'
    AND is_permanent = TRUE
);

UPDATE transactions SET from_account_id = 'sys-acc-equity'
WHERE from_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL 
    AND LOWER(TRIM(name)) = 'owner equity' 
    AND id != 'sys-acc-equity'
    AND is_permanent = TRUE
);

UPDATE transactions SET to_account_id = 'sys-acc-equity'
WHERE to_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL 
    AND LOWER(TRIM(name)) = 'owner equity' 
    AND id != 'sys-acc-equity'
    AND is_permanent = TRUE
);

-- Internal Clearing duplicates → sys-acc-clearing
UPDATE transactions SET account_id = 'sys-acc-clearing'
WHERE account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL 
    AND LOWER(TRIM(name)) = 'internal clearing' 
    AND id != 'sys-acc-clearing'
    AND is_permanent = TRUE
);

UPDATE transactions SET from_account_id = 'sys-acc-clearing'
WHERE from_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL 
    AND LOWER(TRIM(name)) = 'internal clearing' 
    AND id != 'sys-acc-clearing'
    AND is_permanent = TRUE
);

UPDATE transactions SET to_account_id = 'sys-acc-clearing'
WHERE to_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL 
    AND LOWER(TRIM(name)) = 'internal clearing' 
    AND id != 'sys-acc-clearing'
    AND is_permanent = TRUE
);

-- ============================================================================
-- STEP 2: Reassign investment references from duplicates → global system accounts
-- ============================================================================

UPDATE investments SET investor_account_id = 'sys-acc-cash'
WHERE investor_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL 
    AND LOWER(TRIM(name)) = 'cash' 
    AND id != 'sys-acc-cash'
    AND (is_permanent = TRUE OR type = 'Bank')
);

-- ============================================================================
-- STEP 3: Reassign parent_account_id references from duplicates
-- ============================================================================

UPDATE accounts SET parent_account_id = 'sys-acc-cash'
WHERE parent_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL 
    AND LOWER(TRIM(name)) = 'cash' 
    AND id != 'sys-acc-cash'
    AND (is_permanent = TRUE OR type = 'Bank')
);

-- ============================================================================
-- STEP 4: Soft-delete the duplicate tenant-scoped system accounts
-- ============================================================================

UPDATE accounts 
SET deleted_at = NOW(), 
    updated_at = NOW(), 
    name = name || ' (consolidated)',
    version = COALESCE(version, 1) + 1
WHERE tenant_id IS NOT NULL 
  AND id != 'sys-acc-cash'
  AND id != 'sys-acc-ar'
  AND id != 'sys-acc-ap'
  AND id != 'sys-acc-equity'
  AND id != 'sys-acc-clearing'
  AND is_permanent = TRUE
  AND LOWER(TRIM(name)) IN ('cash', 'accounts receivable', 'accounts payable', 'owner equity', 'internal clearing')
  AND deleted_at IS NULL;

-- ============================================================================
-- STEP 5: Ensure all remaining system accounts are global (tenant_id = NULL)
-- ============================================================================

UPDATE accounts SET tenant_id = NULL 
WHERE id IN ('sys-acc-cash', 'sys-acc-ar', 'sys-acc-ap', 'sys-acc-equity', 'sys-acc-clearing')
  AND tenant_id IS NOT NULL;
