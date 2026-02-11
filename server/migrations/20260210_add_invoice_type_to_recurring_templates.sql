-- Migration: Add invoice_type column to recurring_invoice_templates
-- Date: 2026-02-10
-- Description: Stores the invoice type (Rental, Service Charge, Installment) for recurring templates
--              so generated invoices use the correct type instead of always defaulting to Rental.

BEGIN;

DO $$
BEGIN
    -- Only add column if table exists (table may be created in a later migration)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recurring_invoice_templates')
       AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'recurring_invoice_templates' AND column_name = 'invoice_type'
    ) THEN
        ALTER TABLE recurring_invoice_templates ADD COLUMN invoice_type TEXT DEFAULT 'Rental';
        UPDATE recurring_invoice_templates SET invoice_type = 'Rental' WHERE invoice_type IS NULL;
    END IF;
END $$;

COMMIT;
