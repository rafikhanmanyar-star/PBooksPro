-- Migration v2: Re-consolidate duplicate system accounts
-- The v1 migration only caught duplicates with is_permanent=TRUE.
-- This v2 catches ALL tenant-scoped duplicates regardless of is_permanent flag,
-- since tenant-created "Cash" accounts have is_permanent=FALSE.

-- ============================================================================
-- STEP 1: Reassign ALL transaction references from remaining duplicates
-- ============================================================================

-- Cash
UPDATE transactions SET account_id = 'sys-acc-cash'
WHERE account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL AND LOWER(TRIM(name)) IN ('cash', 'cash (consolidated)') AND id != 'sys-acc-cash'
);
UPDATE transactions SET from_account_id = 'sys-acc-cash'
WHERE from_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL AND LOWER(TRIM(name)) IN ('cash', 'cash (consolidated)') AND id != 'sys-acc-cash'
);
UPDATE transactions SET to_account_id = 'sys-acc-cash'
WHERE to_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL AND LOWER(TRIM(name)) IN ('cash', 'cash (consolidated)') AND id != 'sys-acc-cash'
);

-- Accounts Receivable
UPDATE transactions SET account_id = 'sys-acc-ar'
WHERE account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL AND LOWER(TRIM(name)) IN ('accounts receivable', 'accounts receivable (consolidated)') AND id != 'sys-acc-ar'
);
UPDATE transactions SET from_account_id = 'sys-acc-ar'
WHERE from_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL AND LOWER(TRIM(name)) IN ('accounts receivable', 'accounts receivable (consolidated)') AND id != 'sys-acc-ar'
);
UPDATE transactions SET to_account_id = 'sys-acc-ar'
WHERE to_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL AND LOWER(TRIM(name)) IN ('accounts receivable', 'accounts receivable (consolidated)') AND id != 'sys-acc-ar'
);

-- Accounts Payable
UPDATE transactions SET account_id = 'sys-acc-ap'
WHERE account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL AND LOWER(TRIM(name)) IN ('accounts payable', 'accounts payable (consolidated)') AND id != 'sys-acc-ap'
);
UPDATE transactions SET from_account_id = 'sys-acc-ap'
WHERE from_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL AND LOWER(TRIM(name)) IN ('accounts payable', 'accounts payable (consolidated)') AND id != 'sys-acc-ap'
);
UPDATE transactions SET to_account_id = 'sys-acc-ap'
WHERE to_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL AND LOWER(TRIM(name)) IN ('accounts payable', 'accounts payable (consolidated)') AND id != 'sys-acc-ap'
);

-- Owner Equity
UPDATE transactions SET account_id = 'sys-acc-equity'
WHERE account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL AND LOWER(TRIM(name)) IN ('owner equity', 'owner equity (consolidated)') AND id != 'sys-acc-equity'
);
UPDATE transactions SET from_account_id = 'sys-acc-equity'
WHERE from_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL AND LOWER(TRIM(name)) IN ('owner equity', 'owner equity (consolidated)') AND id != 'sys-acc-equity'
);
UPDATE transactions SET to_account_id = 'sys-acc-equity'
WHERE to_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL AND LOWER(TRIM(name)) IN ('owner equity', 'owner equity (consolidated)') AND id != 'sys-acc-equity'
);

-- Internal Clearing
UPDATE transactions SET account_id = 'sys-acc-clearing'
WHERE account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL AND LOWER(TRIM(name)) IN ('internal clearing', 'internal clearing (consolidated)') AND id != 'sys-acc-clearing'
);
UPDATE transactions SET from_account_id = 'sys-acc-clearing'
WHERE from_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL AND LOWER(TRIM(name)) IN ('internal clearing', 'internal clearing (consolidated)') AND id != 'sys-acc-clearing'
);
UPDATE transactions SET to_account_id = 'sys-acc-clearing'
WHERE to_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL AND LOWER(TRIM(name)) IN ('internal clearing', 'internal clearing (consolidated)') AND id != 'sys-acc-clearing'
);

-- ============================================================================
-- STEP 2: Reassign investment and parent_account_id references
-- ============================================================================

UPDATE investments SET investor_account_id = 'sys-acc-cash'
WHERE investor_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL AND LOWER(TRIM(name)) IN ('cash', 'cash (consolidated)') AND id != 'sys-acc-cash'
);

UPDATE accounts SET parent_account_id = 'sys-acc-cash'
WHERE parent_account_id IN (
  SELECT id FROM accounts 
  WHERE tenant_id IS NOT NULL AND LOWER(TRIM(name)) IN ('cash', 'cash (consolidated)') AND id != 'sys-acc-cash'
);

-- ============================================================================
-- STEP 3: Soft-delete ALL remaining duplicate tenant-scoped accounts
-- No is_permanent filter — catch everything
-- ============================================================================

UPDATE accounts 
SET deleted_at = NOW(), 
    updated_at = NOW(), 
    name = CASE 
      WHEN name NOT LIKE '% (consolidated)' THEN name || ' (consolidated)' 
      ELSE name 
    END,
    version = COALESCE(version, 1) + 1
WHERE tenant_id IS NOT NULL 
  AND id NOT IN ('sys-acc-cash', 'sys-acc-ar', 'sys-acc-ap', 'sys-acc-equity', 'sys-acc-clearing')
  AND LOWER(TRIM(name)) IN (
    'cash', 'cash (consolidated)',
    'accounts receivable', 'accounts receivable (consolidated)',
    'accounts payable', 'accounts payable (consolidated)',
    'owner equity', 'owner equity (consolidated)',
    'internal clearing', 'internal clearing (consolidated)'
  );

-- ============================================================================
-- STEP 4: Ensure sys-acc-* accounts are global
-- ============================================================================

UPDATE accounts SET tenant_id = NULL 
WHERE id IN ('sys-acc-cash', 'sys-acc-ar', 'sys-acc-ap', 'sys-acc-equity', 'sys-acc-clearing')
  AND tenant_id IS NOT NULL;
