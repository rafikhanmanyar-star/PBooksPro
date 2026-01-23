-- Migration: Add 'Sale Recognized' status to installment_plans
-- Date: 2026-01-23
-- Description: Adds 'Sale Recognized' as a valid status value for installment plans
--              This status is used when a plan has been successfully converted to an agreement

-- Drop the existing CHECK constraint
ALTER TABLE installment_plans 
DROP CONSTRAINT IF EXISTS installment_plans_status_check;

-- Add the new CHECK constraint with 'Sale Recognized' included
ALTER TABLE installment_plans
ADD CONSTRAINT installment_plans_status_check 
CHECK (status IN ('Draft', 'Pending Approval', 'Approved', 'Rejected', 'Locked', 'Sale Recognized'));

-- Add comment for documentation
COMMENT ON COLUMN installment_plans.status IS 'Plan status: Draft, Pending Approval, Approved, Rejected, Locked, or Sale Recognized (when converted to agreement)';
