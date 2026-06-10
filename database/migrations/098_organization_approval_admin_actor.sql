-- Platform admins (admin_users) approve orgs — not tenant users.

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_approved_by_fkey;
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_rejected_by_fkey;
