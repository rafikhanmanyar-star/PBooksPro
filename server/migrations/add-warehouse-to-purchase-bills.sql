-- Migration: Add warehouse_id to purchase_bills table
-- This migration adds warehouse support to purchase bills

-- Add warehouse_id column to purchase_bills table
ALTER TABLE purchase_bills 
ADD COLUMN IF NOT EXISTS warehouse_id TEXT;

-- Add foreign key constraint
ALTER TABLE purchase_bills
ADD CONSTRAINT fk_purchase_bills_warehouse 
FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_purchase_bills_warehouse ON purchase_bills(warehouse_id);

-- Log migration completion
DO $$ 
BEGIN
    RAISE NOTICE 'Migration completed: warehouse_id added to purchase_bills table';
END $$;
