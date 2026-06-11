-- Track active client sessions for admin monitoring and force-logout.

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  login_event_id TEXT REFERENCES login_events(id) ON DELETE SET NULL,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_tenant_activity
  ON user_sessions (tenant_id, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_sessions_activity
  ON user_sessions (last_activity_at DESC);

ALTER TABLE users ADD COLUMN IF NOT EXISTS login_status BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- Seed sessions from open login events (one row per user/tenant — avoids ON CONFLICT 21000).
INSERT INTO user_sessions (id, user_id, tenant_id, login_event_id, last_activity_at)
SELECT
  'us_' || replace(gen_random_uuid()::text, '-', ''),
  le.user_id,
  le.tenant_id,
  le.id,
  le.login_time
FROM (
  SELECT DISTINCT ON (user_id, tenant_id)
    id,
    user_id,
    tenant_id,
    login_time
  FROM login_events
  WHERE status = 'success'
    AND logout_time IS NULL
    AND user_id IS NOT NULL
  ORDER BY user_id, tenant_id, login_time DESC
) le
ON CONFLICT (user_id, tenant_id) DO UPDATE SET
  last_activity_at = GREATEST(user_sessions.last_activity_at, EXCLUDED.last_activity_at),
  login_event_id = COALESCE(user_sessions.login_event_id, EXCLUDED.login_event_id);

UPDATE users u
SET login_status = TRUE,
    last_login = le.login_time,
    updated_at = NOW()
FROM login_events le
WHERE le.user_id = u.id
  AND le.tenant_id = u.tenant_id
  AND le.status = 'success'
  AND le.logout_time IS NULL
  AND le.login_time = (
    SELECT MAX(le2.login_time)
    FROM login_events le2
    WHERE le2.user_id = u.id
      AND le2.tenant_id = u.tenant_id
      AND le2.status = 'success'
      AND le2.logout_time IS NULL
  );
