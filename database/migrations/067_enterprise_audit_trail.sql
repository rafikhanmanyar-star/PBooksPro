-- Enterprise audit trail: login sessions + immutable audit events.

CREATE TABLE IF NOT EXISTS login_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  email TEXT,
  login_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  logout_time TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'logout'))
);

CREATE INDEX IF NOT EXISTS idx_login_events_tenant_time ON login_events(tenant_id, login_time DESC);
CREATE INDEX IF NOT EXISTS idx_login_events_user ON login_events(tenant_id, user_id, login_time DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  email TEXT,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  summary TEXT,
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  user_agent TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_time ON audit_events(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_module ON audit_events(tenant_id, module, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(tenant_id, action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_user ON audit_events(tenant_id, user_id, occurred_at DESC);

COMMENT ON TABLE login_events IS 'Authentication session log; logout_time may be set once on logout.';
COMMENT ON TABLE audit_events IS 'Immutable enterprise audit trail (insert-only).';

-- Immutable audit_events (no update/delete).
CREATE OR REPLACE FUNCTION deny_audit_events_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events are immutable';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_immutable_upd ON audit_events;
CREATE TRIGGER audit_events_immutable_upd
  BEFORE UPDATE ON audit_events
  FOR EACH ROW
  EXECUTE PROCEDURE deny_audit_events_mutation();

DROP TRIGGER IF EXISTS audit_events_immutable_del ON audit_events;
CREATE TRIGGER audit_events_immutable_del
  BEFORE DELETE ON audit_events
  FOR EACH ROW
  EXECUTE PROCEDURE deny_audit_events_mutation();

-- login_events: only logout_time and status may change (session close).
CREATE OR REPLACE FUNCTION login_events_logout_only_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.login_time IS DISTINCT FROM OLD.login_time
       OR NEW.ip_address IS DISTINCT FROM OLD.ip_address
       OR NEW.user_agent IS DISTINCT FROM OLD.user_agent THEN
      RAISE EXCEPTION 'login_events are immutable except logout_time and status';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'login_events cannot be deleted';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS login_events_immutable_del ON login_events;
CREATE TRIGGER login_events_immutable_del
  BEFORE DELETE ON login_events
  FOR EACH ROW
  EXECUTE PROCEDURE deny_audit_events_mutation();

DROP TRIGGER IF EXISTS login_events_logout_only_upd ON login_events;
CREATE TRIGGER login_events_logout_only_upd
  BEFORE UPDATE ON login_events
  FOR EACH ROW
  EXECUTE PROCEDURE login_events_logout_only_update();
