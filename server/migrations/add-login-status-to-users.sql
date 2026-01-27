-- Add login_status column to users table
-- This flag tracks if a user is currently logged in
-- Used for preventing duplicate logins and showing online users in chat

-- Add login_status column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'login_status'
    ) THEN
        ALTER TABLE users 
        ADD COLUMN login_status BOOLEAN NOT NULL DEFAULT FALSE;
        
        -- Create index for faster queries on login_status
        CREATE INDEX IF NOT EXISTS idx_users_login_status ON users(login_status);
        
        -- Create composite index for tenant_id + login_status (for online users queries)
        CREATE INDEX IF NOT EXISTS idx_users_tenant_login_status ON users(tenant_id, login_status);
        
        RAISE NOTICE 'Added login_status column to users table';
    ELSE
        RAISE NOTICE 'login_status column already exists in users table';
    END IF;
END $$;

