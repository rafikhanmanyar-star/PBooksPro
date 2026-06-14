-- Repair user_tenants.role when it diverged from users.role (login/auth use user_tenants).

UPDATE user_tenants ut
SET role = u.role
FROM users u
WHERE ut.user_id = u.id
  AND ut.tenant_id = u.tenant_id
  AND ut.role IS DISTINCT FROM u.role;
