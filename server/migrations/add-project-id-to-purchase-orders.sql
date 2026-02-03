-- Migration: Add project_id column to purchase_orders table
-- Required for buyer dashboard "New PO" form (project selection)

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'purchase_orders' AND column_name = 'project_id'
    ) THEN
        ALTER TABLE purchase_orders ADD COLUMN project_id TEXT;
        RAISE NOTICE 'Column project_id added to purchase_orders table';
    ELSE
        RAISE NOTICE 'Column project_id already exists in purchase_orders table';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_po_project_id ON purchase_orders(project_id);
