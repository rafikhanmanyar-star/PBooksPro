-- Migration: Increase user restriction policy from 5 to 20
-- System administrators can create up to 20 users per organization.

-- Set default for new tenants
ALTER TABLE tenants ALTER COLUMN max_users SET DEFAULT 20;

-- Update existing tenants: bump from 5 (or NULL) to 20; leave custom values unchanged
UPDATE tenants
SET max_users = 20
WHERE max_users IS NULL OR max_users = 5;
