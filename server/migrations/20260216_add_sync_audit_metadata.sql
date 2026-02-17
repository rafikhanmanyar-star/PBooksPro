-- Migration: Add Soft Deletes and Versioning for Sync Support
-- Created: 2026-02-16

DO $$ 
DECLARE
    table_name_text TEXT;
    target_tables TEXT[] := ARRAY[
        'transactions', 'accounts', 'contacts', 'vendors', 'categories', 
        'invoices', 'bills', 'projects', 'buildings', 'properties', 'units',
        'budgets', 'plan_amenities', 'rental_agreements', 'project_agreements',
        'installment_plans', 'contracts', 'sales_returns', 'quotations', 
        'documents', 'recurring_invoice_templates', 'pm_cycle_allocations',
        'payroll_employees', 'payroll_runs', 'task_items', 'task_initiatives',
        'task_objectives', 'task_key_results'
    ];
BEGIN
    FOREACH table_name_text IN ARRAY target_tables
    LOOP
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

-- Update existing records to have version = 1 if null (though DEFAULT 1 handles new rows)
-- This is just to be safe for any existing rows that might have tripped up the default
DO $$ 
DECLARE
    table_name_text TEXT;
    target_tables TEXT[] := ARRAY[
        'transactions', 'accounts', 'contacts', 'vendors', 'categories', 
        'invoices', 'bills', 'projects', 'buildings', 'properties', 'units',
        'budgets', 'plan_amenities', 'rental_agreements', 'project_agreements',
        'installment_plans', 'contracts', 'sales_returns', 'quotations', 
        'documents', 'recurring_invoice_templates', 'pm_cycle_allocations',
        'payroll_employees', 'payroll_runs', 'task_items', 'task_initiatives',
        'task_objectives', 'task_key_results'
    ];
BEGIN
    FOREACH table_name_text IN ARRAY target_tables
    LOOP
        EXECUTE format('UPDATE %I SET version = 1 WHERE version IS NULL', table_name_text);
    END LOOP;
END $$;
