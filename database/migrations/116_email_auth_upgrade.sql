-- Email-based global login identity: backfill, verification flags, password-reset framework.
-- Depends on 099_users_global_login_identity_unique.sql (case-insensitive unique email index).

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_requires_update BOOLEAN NOT NULL DEFAULT FALSE;

-- Password reset tokens (email delivery wired separately).
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at)
  WHERE used_at IS NULL;

-- Email verification tokens (cloud edition — sender not required for schema).
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_verification_tokens_hash ON email_verification_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user ON email_verification_tokens(user_id);

-- Migration audit trail (cloud PostgreSQL).
CREATE TABLE IF NOT EXISTS auth_migration_reports (
  id TEXT PRIMARY KEY,
  edition TEXT NOT NULL,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  users_total INTEGER NOT NULL DEFAULT 0,
  users_backfilled INTEGER NOT NULL DEFAULT 0,
  users_already_had_email INTEGER NOT NULL DEFAULT 0,
  duplicates_resolved INTEGER NOT NULL DEFAULT 0,
  report_json JSONB
);

-- Backfill users without email: username@company.local (disambiguate on collision).
DO $$
DECLARE
  r RECORD;
  candidate TEXT;
  attempt INT;
BEGIN
  FOR r IN
    SELECT id, username FROM users
    WHERE email IS NULL OR TRIM(email) = ''
    ORDER BY created_at NULLS LAST, id
  LOOP
    attempt := 0;
    candidate := LOWER(REGEXP_REPLACE(TRIM(COALESCE(r.username, 'user')), '[^a-zA-Z0-9._-]', '', 'g'))
      || CASE WHEN attempt > 0 THEN '.' || SUBSTRING(REPLACE(r.id, '-', ''), 1, 8) ELSE '' END
      || '@company.local';
    IF candidate = '@company.local' THEN
      candidate := 'user.' || SUBSTRING(REPLACE(r.id, '-', ''), 1, 8) || '@company.local';
    END IF;

    WHILE EXISTS (
      SELECT 1 FROM users u2
      WHERE LOWER(TRIM(u2.email)) = LOWER(TRIM(candidate))
        AND u2.id <> r.id
    ) LOOP
      attempt := attempt + 1;
      candidate := LOWER(REGEXP_REPLACE(TRIM(COALESCE(r.username, 'user')), '[^a-zA-Z0-9._-]', '', 'g'))
        || '.' || SUBSTRING(REPLACE(r.id, '-', ''), 1, 8)
        || CASE WHEN attempt > 1 THEN attempt::TEXT ELSE '' END
        || '@company.local';
    END LOOP;

    UPDATE users
    SET email = candidate,
        email_requires_update = TRUE,
        updated_at = NOW()
    WHERE id = r.id;
  END LOOP;
END $$;

-- Record cloud migration summary.
INSERT INTO auth_migration_reports (
  id, edition, users_total, users_backfilled, users_already_had_email, duplicates_resolved, report_json
)
SELECT
  'auth_mig_cloud_' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS'),
  'cloud',
  (SELECT COUNT(*) FROM users),
  (SELECT COUNT(*) FROM users WHERE email_requires_update = TRUE),
  (SELECT COUNT(*) FROM users WHERE email_requires_update = FALSE AND email IS NOT NULL AND TRIM(email) <> ''),
  0,
  jsonb_build_object(
    'message', 'Email auth upgrade migration applied',
    'placeholderDomain', 'company.local',
    'adminAction', 'Review users with email_requires_update = TRUE and set real email addresses'
  )
ON CONFLICT DO NOTHING;
