-- Migration: Add Soft Deletes and Versioning for Missing Tables
-- Created: 2026-02-16
-- Skips tables that don't exist (e.g. task_* tables may not exist yet)

DO $$ 
DECLARE
    table_name_text TEXT;
    target_tables TEXT[] := ARRAY[
        'payroll_employees', 'payroll_runs'
    ];
BEGIN
    FOREACH table_name_text IN ARRAY target_tables
    LOOP
        -- Skip if table doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = table_name_text
        ) THEN
            CONTINUE;
        END IF;

        -- Add deleted_at if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = table_name_text AND column_name = 'deleted_at'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN deleted_at TIMESTAMP', table_name_text);
        END IF;

        -- Add version if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = table_name_text AND column_name = 'version'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN version INTEGER DEFAULT 1', table_name_text);
        END IF;
    END LOOP;
END $$;

-- Update existing records to have version = 1 if null
DO $$ 
DECLARE
    table_name_text TEXT;
    target_tables TEXT[] := ARRAY[
        'payroll_employees', 'payroll_runs'
    ];
BEGIN
    FOREACH table_name_text IN ARRAY target_tables
    LOOP
        -- Skip if table doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = table_name_text
        ) THEN
            CONTINUE;
        END IF;
        EXECUTE format('UPDATE %I SET version = 1 WHERE version IS NULL', table_name_text);
    END LOOP;
END $$;
