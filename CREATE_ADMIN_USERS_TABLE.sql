-- Quick SQL to create admin_users table and insert admin user
-- Run this in DBeaver after connecting to your Render database

-- Step 1: Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Step 2: Create admin_users table
CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_role CHECK (role IN ('super_admin', 'admin'))
);

-- Step 3: Create admin user
-- Password: admin123 (bcrypt hash with 10 rounds)
-- Generate hash at: https://bcrypt-generator.com/
INSERT INTO admin_users (id, username, name, email, password, role, is_active, created_at, updated_at)
VALUES (
  'admin_1',
  'Admin',
  'Super Admin',
  'admin@pbookspro.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  'super_admin',
  TRUE,
  NOW(),
  NOW()
)
ON CONFLICT (username) DO UPDATE 
SET password = EXCLUDED.password, is_active = TRUE, updated_at = NOW();

-- Step 4: Verify admin user was created
SELECT id, username, name, email, role, is_active, created_at 
FROM admin_users 
WHERE username = 'Admin';

-- Expected result:
-- id: admin_1
-- username: Admin
-- name: Super Admin
-- email: admin@pbookspro.com
-- role: super_admin
-- is_active: TRUE

