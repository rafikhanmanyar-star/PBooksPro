-- Migration: Add plan_amenities table and update installment_plans table
-- This migration adds support for configurable amenities in installment plans
-- and links discount fields to expense categories

-- ============================================================================
-- PLAN AMENITIES TABLE
-- ============================================================================
-- Stores configurable amenities that can be added to installment plans
-- Each amenity has a price (fixed amount or percentage of list price)

CREATE TABLE IF NOT EXISTS plan_amenities (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    price DECIMAL(15, 2) NOT NULL DEFAULT 0,
    is_percentage BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Create index for faster tenant lookups
CREATE INDEX IF NOT EXISTS idx_plan_amenities_tenant ON plan_amenities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_plan_amenities_active ON plan_amenities(tenant_id, is_active);

-- ============================================================================
-- UPDATE INSTALLMENT_PLANS TABLE
-- ============================================================================
-- Add columns for discount category mappings and selected amenities

-- Add discount category ID columns (link to expense categories from chart of accounts)
ALTER TABLE installment_plans 
ADD COLUMN IF NOT EXISTS customer_discount_category_id TEXT;

ALTER TABLE installment_plans 
ADD COLUMN IF NOT EXISTS floor_discount_category_id TEXT;

ALTER TABLE installment_plans 
ADD COLUMN IF NOT EXISTS lump_sum_discount_category_id TEXT;

ALTER TABLE installment_plans 
ADD COLUMN IF NOT EXISTS misc_discount_category_id TEXT;

-- Add column for selected amenities (stored as JSONB array)
-- Format: [{ "amenityId": "...", "amenityName": "...", "calculatedAmount": 1234.56 }, ...]
ALTER TABLE installment_plans 
ADD COLUMN IF NOT EXISTS selected_amenities JSONB DEFAULT '[]'::jsonb;

-- Add column for total amenities amount
ALTER TABLE installment_plans 
ADD COLUMN IF NOT EXISTS amenities_total DECIMAL(15, 2) DEFAULT 0;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE plan_amenities IS 'Configurable amenities that can be added to installment plans with fixed or percentage-based pricing';
COMMENT ON COLUMN plan_amenities.is_percentage IS 'If true, price is percentage of list price; if false, price is a fixed amount';
COMMENT ON COLUMN installment_plans.customer_discount_category_id IS 'Links to expense category from chart of accounts for customer discount';
COMMENT ON COLUMN installment_plans.floor_discount_category_id IS 'Links to expense category from chart of accounts for floor discount';
COMMENT ON COLUMN installment_plans.lump_sum_discount_category_id IS 'Links to expense category from chart of accounts for lump sum discount';
COMMENT ON COLUMN installment_plans.misc_discount_category_id IS 'Links to expense category from chart of accounts for misc discount';
COMMENT ON COLUMN installment_plans.selected_amenities IS 'Array of selected amenities with their calculated amounts';
COMMENT ON COLUMN installment_plans.amenities_total IS 'Total amount from all selected amenities';

-- ============================================================================
-- ROLLBACK SCRIPT (for reference, run manually if needed)
-- ============================================================================
-- DROP TABLE IF EXISTS plan_amenities;
-- ALTER TABLE installment_plans DROP COLUMN IF EXISTS customer_discount_category_id;
-- ALTER TABLE installment_plans DROP COLUMN IF EXISTS floor_discount_category_id;
-- ALTER TABLE installment_plans DROP COLUMN IF EXISTS lump_sum_discount_category_id;
-- ALTER TABLE installment_plans DROP COLUMN IF EXISTS misc_discount_category_id;
-- ALTER TABLE installment_plans DROP COLUMN IF EXISTS selected_amenities;
-- ALTER TABLE installment_plans DROP COLUMN IF EXISTS amenities_total;
