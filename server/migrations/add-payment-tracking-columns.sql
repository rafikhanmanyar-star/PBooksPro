-- Migration: Add payment tracking columns to shop_sales
-- This adds total_paid and change_due columns to properly track tender and refund amounts

ALTER TABLE shop_sales 
ADD COLUMN IF NOT EXISTS total_paid DECIMAL(15, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS change_due DECIMAL(15, 2) DEFAULT 0;

-- Update existing records to set total_paid = grand_total for completed sales
UPDATE shop_sales 
SET total_paid = grand_total, change_due = 0
WHERE total_paid IS NULL OR total_paid = 0;

-- Add comments to explain the columns
COMMENT ON COLUMN shop_sales.total_paid IS 'Total amount tendered by customer (may be more than grand_total)';
COMMENT ON COLUMN shop_sales.change_due IS 'Change/refund amount to return to customer (total_paid - grand_total)';
