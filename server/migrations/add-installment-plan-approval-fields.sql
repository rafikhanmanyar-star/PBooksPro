-- Migration: Add installment plan approval workflow fields
-- Date: 2026-01-22
-- Description: Adds approval tracking columns and expands status check

ALTER TABLE installment_plans
ADD COLUMN IF NOT EXISTS approval_requested_by TEXT;

ALTER TABLE installment_plans
ADD COLUMN IF NOT EXISTS approval_requested_to TEXT;

ALTER TABLE installment_plans
ADD COLUMN IF NOT EXISTS approval_requested_at TEXT;

ALTER TABLE installment_plans
ADD COLUMN IF NOT EXISTS approval_reviewed_by TEXT;

ALTER TABLE installment_plans
ADD COLUMN IF NOT EXISTS approval_reviewed_at TEXT;

ALTER TABLE installment_plans
DROP CONSTRAINT IF EXISTS installment_plans_status_check;

ALTER TABLE installment_plans
ADD CONSTRAINT installment_plans_status_check
CHECK (status IN ('Draft', 'Pending Approval', 'Approved', 'Rejected', 'Locked'));

COMMENT ON COLUMN installment_plans.approval_requested_by IS 'User ID who requested approval';
COMMENT ON COLUMN installment_plans.approval_requested_to IS 'User ID assigned to approve';
COMMENT ON COLUMN installment_plans.approval_requested_at IS 'Timestamp when approval was requested';
COMMENT ON COLUMN installment_plans.approval_reviewed_by IS 'User ID who reviewed approval';
COMMENT ON COLUMN installment_plans.approval_reviewed_at IS 'Timestamp when approval was reviewed';
