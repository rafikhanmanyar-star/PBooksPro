-- SQL Script to Create Admin User in Render Database
-- Run this in Render Dashboard → Database → Connect → psql

-- First, check if admin_users table exists
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'admin_users';

-- Check if admin user already exists
SELECT id, username, email, is_active, role 
FROM admin_users 
WHERE username = 'Admin' OR username = 'admin';

-- Create or update admin user
-- Password: admin123 (bcrypt hash with 10 rounds)
-- Generate hash using: bcrypt.hash('admin123', 10)
-- Or use online tool: https://bcrypt-generator.com/

INSERT INTO admin_users (id, username, name, email, password, role, is_active, created_at, updated_at)
VALUES (
  'admin_1',
  'Admin',
  'Super Admin',
  'admin@pbookspro.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',  -- Replace with your generated hash
  'super_admin',
  TRUE,
  NOW(),
  NOW()
)
ON CONFLICT (username) DO UPDATE 
SET 
  password = EXCLUDED.password,
  is_active = TRUE,
  updated_at = NOW();

-- Verify the admin user was created/updated
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

