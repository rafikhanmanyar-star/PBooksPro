-- Fix missing unique constraints for ON CONFLICT statements and missing columns
-- Date: 2026-02-15

-- 1. Ensure schema_migrations has a unique constraint on migration_name
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'schema_migrations'::regclass 
        AND contype = 'u' 
        AND conname = 'schema_migrations_migration_name_key'
    ) THEN
        -- Clean up duplicates if any
        DELETE FROM schema_migrations a USING schema_migrations b 
        WHERE a.id > b.id AND a.migration_name = b.migration_name;
        
        ALTER TABLE schema_migrations ADD CONSTRAINT schema_migrations_migration_name_key UNIQUE (migration_name);
    END IF;
END $$;

-- 2. Ensure admin_users has a unique constraint on username
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'admin_users'::regclass 
        AND contype = 'u' 
        AND conname = 'admin_users_username_key'
    ) THEN
        ALTER TABLE admin_users ADD CONSTRAINT admin_users_username_key UNIQUE (username);
    END IF;
END $$;

-- 3. Ensure documents has updated_at column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'documents' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE documents ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
        -- Initialize with uploaded_at
        UPDATE documents SET updated_at = uploaded_at WHERE updated_at IS NULL;
    END IF;
END $$;
