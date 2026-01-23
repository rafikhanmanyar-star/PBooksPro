-- Migration: Fix payroll runs stuck in PROCESSING status
-- Description: Updates any payroll runs with PROCESSING status to DRAFT status
-- This fixes runs that were created before the payroll processing fix was applied

-- Update all payroll runs that are stuck in PROCESSING status to DRAFT
UPDATE payroll_runs 
SET status = 'DRAFT'
WHERE status = 'PROCESSING';

-- Show affected records
SELECT 
    id,
    month,
    year,
    status,
    employee_count,
    total_amount,
    created_at
FROM payroll_runs
WHERE status = 'DRAFT'
ORDER BY created_at DESC;
