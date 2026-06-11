-- Global login email uniqueness: one email -> one user account (case-insensitive).
-- Unified login resolves the organization from email without ambiguity.
-- Username uniqueness for *new* users is enforced in application code (userIdentityService);
-- we do not add a global username index because existing tenants often share names like "admin".
--
-- If this migration fails, resolve duplicate emails before re-running:
--   SELECT LOWER(TRIM(email)), COUNT(*) FROM users
--   WHERE email IS NOT NULL AND TRIM(email) <> ''
--   GROUP BY 1 HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_global_lower
  ON users (LOWER(TRIM(email)))
  WHERE email IS NOT NULL AND TRIM(email) <> '';