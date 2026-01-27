-- Migration: Add received_quantity column to purchase_bill_items table
-- This enables partial receiving of items from purchase bills

-- Add received_quantity column to purchase_bill_items (PostgreSQL)
ALTER TABLE purchase_bill_items 
ADD COLUMN IF NOT EXISTS received_quantity DECIMAL(15, 3) NOT NULL DEFAULT 0;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_purchase_bill_items_received_quantity 
ON purchase_bill_items(tenant_id, received_quantity) 
WHERE received_quantity > 0;

-- Log migration completion
DO $$ 
BEGIN
    RAISE NOTICE 'Migration completed: received_quantity column added to purchase_bill_items';
END $$;
