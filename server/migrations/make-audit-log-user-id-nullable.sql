-- Migration: Make transaction_audit_log.user_id nullable
-- This allows user deletion while preserving audit trail (user_name and user_role remain)
-- Date: 2024

-- Check if the NOT NULL constraint exists and drop it
DO $$
BEGIN
    -- Check if column exists and has NOT NULL constraint
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'transaction_audit_log' 
        AND column_name = 'user_id'
        AND is_nullable = 'NO'
    ) THEN
        -- Alter the column to allow NULL values
        ALTER TABLE transaction_audit_log 
        ALTER COLUMN user_id DROP NOT NULL;
        
        RAISE NOTICE 'Successfully made transaction_audit_log.user_id nullable';
    ELSE
        RAISE NOTICE 'Column transaction_audit_log.user_id is already nullable or does not exist';
    END IF;
END $$;

-- Note: The foreign key constraint with ON DELETE SET NULL will now work correctly
-- When a user is deleted, user_id will be set to NULL, but user_name and user_role
-- will remain to preserve the audit trail

