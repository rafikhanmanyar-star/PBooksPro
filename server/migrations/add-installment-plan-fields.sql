-- Migration: Add version, rootId, status, introText, and discounts fields to installment_plans table
-- Date: 2024
-- Description: Adds versioning, status tracking, intro text, and discounts array support to installment plans

-- Add intro_text column
ALTER TABLE installment_plans 
ADD COLUMN IF NOT EXISTS intro_text TEXT;

-- Add version column
ALTER TABLE installment_plans 
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Add root_id column (for versioning - links all versions of a plan)
ALTER TABLE installment_plans 
ADD COLUMN IF NOT EXISTS root_id TEXT;

-- Add status column (Draft or Locked)
ALTER TABLE installment_plans 
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Draft';

-- Add CHECK constraint for status
ALTER TABLE installment_plans 
DROP CONSTRAINT IF EXISTS installment_plans_status_check;

ALTER TABLE installment_plans 
ADD CONSTRAINT installment_plans_status_check CHECK (status IN ('Draft', 'Locked'));

-- Add discounts column (JSONB array of discount objects)
ALTER TABLE installment_plans 
ADD COLUMN IF NOT EXISTS discounts JSONB DEFAULT '[]'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN installment_plans.intro_text IS 'Custom editable text that appears after "Exclusively for You" in the proposal';
COMMENT ON COLUMN installment_plans.version IS 'Version number of this plan (increments for each new version)';
COMMENT ON COLUMN installment_plans.root_id IS 'ID of the first version of this plan (links all versions together)';
COMMENT ON COLUMN installment_plans.status IS 'Status of the plan: Draft (editable) or Locked (approved, read-only)';
COMMENT ON COLUMN installment_plans.discounts IS 'JSONB array of discount objects with id, name, amount, and optional categoryId';
