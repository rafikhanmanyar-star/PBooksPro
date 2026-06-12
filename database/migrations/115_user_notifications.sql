-- In-app user notifications (bell icon): quick transactions, status updates, etc.

CREATE TABLE IF NOT EXISTS user_notifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'urgent')),
  action_type TEXT,
  action_id TEXT,
  entity_type TEXT,
  entity_id TEXT,
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_active
  ON user_notifications (tenant_id, user_id, created_at DESC)
  WHERE dismissed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_notifications_entity
  ON user_notifications (tenant_id, entity_type, entity_id)
  WHERE dismissed_at IS NULL;
