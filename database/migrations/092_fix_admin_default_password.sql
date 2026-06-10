-- Fix default admin portal password hash (087 shipped a hash that does not match admin123).
-- Safe: only updates the known broken default row.

UPDATE admin_users
SET
  password = '$2a$10$1GTuQYyMFJX0v.3f/9Pe9u2e8zZG1N8GbRcUVEAAKQAnbxVqyi3NG',
  updated_at = NOW()
WHERE username = 'Admin'
  AND password = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

-- If no admin exists yet, create default (password: admin123).
INSERT INTO admin_users (id, username, name, email, password, role, is_active)
SELECT
  'admin_1',
  'Admin',
  'Super Admin',
  'admin@pbookspro.com',
  '$2a$10$1GTuQYyMFJX0v.3f/9Pe9u2e8zZG1N8GbRcUVEAAKQAnbxVqyi3NG',
  'super_admin',
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM admin_users LIMIT 1);
