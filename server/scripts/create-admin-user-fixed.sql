-- =====================================================
-- Create Admin User - FIXED SQL Script for DBeaver
-- =====================================================
-- 
-- Use this script AFTER cleaning the staging database
-- This will create an admin user that can login to the admin portal
--
-- ⚠️ CRITICAL REQUIREMENTS:
--   - Username must be exactly "Admin" (capital A) - case sensitive!
--   - Password: admin123
--   - is_active must be TRUE
-- =====================================================

-- Step 1: Verify admin_users table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'admin_users';

-- If table doesn't exist, run migrations first:
-- cd server && npm run migrate

-- Step 2: Check current admin user (if any)
SELECT id, username, email, role, is_active, 
       LENGTH(password) as password_length,
       LEFT(password, 7) as password_prefix
FROM admin_users 
WHERE username = 'Admin' OR username = 'admin' OR id = 'admin_1';

-- Step 3: Delete any existing admin users (clean slate)
-- This ensures we start fresh after database cleanup
DELETE FROM admin_users WHERE id = 'admin_1' OR username IN ('Admin', 'admin');

-- Step 4: Create Admin User with Fresh Password Hash
-- Password: admin123
-- Bcrypt hash (10 rounds): Generated fresh hash
-- Hash generated using: bcrypt.hash('admin123', 10)

INSERT INTO admin_users (
    id, 
    username, 
    name, 
    email, 
    password, 
    role, 
    is_active, 
    created_at, 
    updated_at
)
VALUES (
    'admin_1',
    'Admin',  -- ⚠️ Must be exactly "Admin" (capital A) - case sensitive!
    'Super Admin',
    'admin@pbookspro.com',
    '$2a$10$ZWxizEWeh2zZyW6Z6R.TYuOAjV1TmfJy1PBGevR47H9nU4WUbz.Hy',  -- admin123 (fresh hash)
    'super_admin',
    TRUE,  -- ⚠️ Must be TRUE for login to work!
    NOW(),
    NOW()
);

-- Step 5: Verify the admin user was created correctly
SELECT 
    id,
    username,
    name,
    email,
    role,
    is_active,
    LENGTH(password) as password_length,
    LEFT(password, 7) as password_prefix,
    created_at
FROM admin_users 
WHERE username = 'Admin' OR id = 'admin_1';

-- Expected result:
-- id: admin_1
-- username: Admin (exactly "Admin" with capital A)
-- name: Super Admin
-- email: admin@pbookspro.com
-- role: super_admin
-- is_active: TRUE (must be TRUE!)
-- password_length: 60 (bcrypt hash length)
-- password_prefix: $2a$10$ (bcrypt format)

-- Step 6: Test query (same as login endpoint uses)
-- This should return exactly one row - if it returns 0 rows, login will fail!
SELECT * 
FROM admin_users 
WHERE username = 'Admin' AND is_active = TRUE;

-- =====================================================
-- Troubleshooting Queries
-- =====================================================

-- If login still fails, run these diagnostic queries:

-- 1. Check username case (must be "Admin" not "admin")
SELECT username, is_active, LENGTH(password) as pwd_len
FROM admin_users 
WHERE LOWER(username) = 'admin';

-- 2. Verify is_active flag is TRUE
SELECT id, username, is_active, 
       CASE WHEN is_active THEN '✅ ACTIVE' ELSE '❌ INACTIVE' END as status
FROM admin_users 
WHERE username = 'Admin';

-- 3. Verify password hash format
SELECT 
    id,
    username,
    LENGTH(password) as password_length,
    LEFT(password, 7) as password_prefix,
    CASE 
        WHEN password LIKE '$2a$10$%' THEN '✅ Valid bcrypt hash'
        WHEN password LIKE '$2b$10$%' THEN '✅ Valid bcrypt hash (variant)'
        ELSE '❌ Invalid hash format'
    END as hash_status
FROM admin_users 
WHERE username = 'Admin';

-- 4. Check if admin_users table has the correct structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'admin_users'
ORDER BY ordinal_position;

-- =====================================================
-- Complete Reset (if nothing works)
-- =====================================================
-- Uncomment and run this complete reset:

/*
-- Delete existing admin
DELETE FROM admin_users WHERE id = 'admin_1' OR username IN ('Admin', 'admin');

-- Create fresh admin user
INSERT INTO admin_users (
    id, username, name, email, password, role, is_active, created_at, updated_at
)
VALUES (
    'admin_1',
    'Admin',
    'Super Admin',
    'admin@pbookspro.com',
    '$2a$10$ZWxizEWeh2zZyW6Z6R.TYuOAjV1TmfJy1PBGevR47H9nU4WUbz.Hy',
    'super_admin',
    TRUE,
    NOW(),
    NOW()
);

-- Verify
SELECT id, username, is_active, LENGTH(password) as pwd_len
FROM admin_users WHERE username = 'Admin';
*/
