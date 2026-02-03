-- Migration: Add PO lock columns for buyer/supplier flow (one party edits at a time)
-- See doc/BIZ_PLANET_PO_FLOW.md

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'purchase_orders' AND column_name = 'locked_by_tenant_id'
    ) THEN
        ALTER TABLE purchase_orders ADD COLUMN locked_by_tenant_id TEXT;
        RAISE NOTICE 'Column locked_by_tenant_id added to purchase_orders';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'purchase_orders' AND column_name = 'locked_by_user_id'
    ) THEN
        ALTER TABLE purchase_orders ADD COLUMN locked_by_user_id TEXT;
        RAISE NOTICE 'Column locked_by_user_id added to purchase_orders';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'purchase_orders' AND column_name = 'locked_at'
    ) THEN
        ALTER TABLE purchase_orders ADD COLUMN locked_at TIMESTAMP;
        RAISE NOTICE 'Column locked_at added to purchase_orders';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_po_locked_by_tenant ON purchase_orders(locked_by_tenant_id) WHERE locked_by_tenant_id IS NOT NULL;
