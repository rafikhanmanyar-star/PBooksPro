-- Migration: Add target_delivery_date column to purchase_orders table
-- This migration adds the target delivery date field for PO items

DO $$ 
BEGIN
    -- Add target_delivery_date column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'purchase_orders' AND column_name = 'target_delivery_date'
    ) THEN
        ALTER TABLE purchase_orders ADD COLUMN target_delivery_date DATE;
        RAISE NOTICE 'Column target_delivery_date added to purchase_orders table';
    ELSE
        RAISE NOTICE 'Column target_delivery_date already exists in purchase_orders table';
    END IF;
END $$;

-- Create index for efficient date-based queries
CREATE INDEX IF NOT EXISTS idx_po_target_delivery_date ON purchase_orders(target_delivery_date);
