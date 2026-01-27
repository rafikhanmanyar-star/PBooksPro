-- Migration: Ensure discount category columns exist on installment_plans
-- Date: 2026-01-22
-- Description: Adds missing discount category linkage columns for installment plans

ALTER TABLE installment_plans
ADD COLUMN IF NOT EXISTS customer_discount_category_id TEXT;

ALTER TABLE installment_plans
ADD COLUMN IF NOT EXISTS floor_discount_category_id TEXT;

ALTER TABLE installment_plans
ADD COLUMN IF NOT EXISTS lump_sum_discount_category_id TEXT;

ALTER TABLE installment_plans
ADD COLUMN IF NOT EXISTS misc_discount_category_id TEXT;

COMMENT ON COLUMN installment_plans.customer_discount_category_id IS 'Links to expense category from chart of accounts for customer discount';
COMMENT ON COLUMN installment_plans.floor_discount_category_id IS 'Links to expense category from chart of accounts for floor discount';
COMMENT ON COLUMN installment_plans.lump_sum_discount_category_id IS 'Links to expense category from chart of accounts for lump sum discount';
COMMENT ON COLUMN installment_plans.misc_discount_category_id IS 'Links to expense category from chart of accounts for misc discount';
