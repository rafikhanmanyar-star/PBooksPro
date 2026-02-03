-- Migration: Add income_category_id to p2p_invoices (supplier assigns income category when converting PO to invoice)
-- See doc/BIZ_PLANET_PO_FLOW.md

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'p2p_invoices' AND column_name = 'income_category_id'
    ) THEN
        ALTER TABLE p2p_invoices ADD COLUMN income_category_id TEXT;
        RAISE NOTICE 'Column income_category_id added to p2p_invoices';
    END IF;
END $$;
