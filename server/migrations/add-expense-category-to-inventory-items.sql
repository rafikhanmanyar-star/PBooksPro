-- Migration: Add expense_category_id to inventory_items table
-- This migration adds expense category tracking for inventory items

-- Add expense_category_id column
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS expense_category_id TEXT;

-- Add foreign key constraint
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'inventory_items_expense_category_id_fkey'
    ) THEN
        ALTER TABLE inventory_items 
        ADD CONSTRAINT inventory_items_expense_category_id_fkey 
        FOREIGN KEY (expense_category_id) REFERENCES categories(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Create index for expense_category_id lookups
CREATE INDEX IF NOT EXISTS idx_inventory_items_expense_category_id ON inventory_items(expense_category_id);

-- Log migration completion
DO $$ 
BEGIN
    RAISE NOTICE 'Migration completed: expense_category_id added to inventory_items table';
END $$;
