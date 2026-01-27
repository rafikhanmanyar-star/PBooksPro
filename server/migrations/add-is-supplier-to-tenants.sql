-- Migration: Add is_supplier column to tenants table
-- This column indicates if a tenant is a supplier in the B2B platform

-- Add is_supplier column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'tenants' 
        AND column_name = 'is_supplier'
    ) THEN
        ALTER TABLE tenants ADD COLUMN is_supplier BOOLEAN NOT NULL DEFAULT FALSE;
        RAISE NOTICE 'Column is_supplier added to tenants table';
    ELSE
        RAISE NOTICE 'Column is_supplier already exists in tenants table';
    END IF;
END $$;
