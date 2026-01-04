-- Reset Admin Password with Correct Hash
-- This will update the admin user with a fresh password hash for 'admin123'

-- IMPORTANT: Generate a new hash first!
-- Go to: https://bcrypt-generator.com/
-- Enter: Password = admin123, Rounds = 10
-- Copy the generated hash and replace HASH_HERE below

UPDATE admin_users 
SET 
  password = 'HASH_HERE',  -- Replace with hash from bcrypt-generator.com
  is_active = TRUE,
  username = 'Admin',  -- Ensure correct case
  updated_at = NOW()
WHERE id = 'admin_1';

-- Verify the update
SELECT id, username, is_active, 
       LENGTH(password) as hash_length,
       LEFT(password, 7) as hash_format
FROM admin_users 
WHERE username = 'Admin';

-- Expected:
-- username: Admin
-- is_active: TRUE
-- hash_length: 60
-- hash_format: $2a$10$

-- After updating, try login again:
-- Username: Admin
-- Password: admin123

