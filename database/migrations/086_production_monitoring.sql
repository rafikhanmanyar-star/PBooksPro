-- Production monitoring: events, alerts, health snapshots

CREATE TABLE IF NOT EXISTS monitoring_events (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  code TEXT,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  user_id TEXT,
  route TEXT,
  method TEXT,
  status_code INTEGER,
  duration_ms INTEGER,
  request_id TEXT,
  stack_trace TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monitoring_events_category_time
  ON monitoring_events (category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_monitoring_events_severity_time
  ON monitoring_events (severity, created_at DESC)
  WHERE severity IN ('error', 'critical', 'warn');

CREATE INDEX IF NOT EXISTS idx_monitoring_events_tenant_time
  ON monitoring_events (tenant_id, created_at DESC)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_monitoring_events_request_id
  ON monitoring_events (request_id)
  WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS monitoring_alert_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  min_severity TEXT NOT NULL DEFAULT 'error',
  threshold_count INTEGER NOT NULL DEFAULT 5,
  window_minutes INTEGER NOT NULL DEFAULT 5,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  notify_channels JSONB NOT NULL DEFAULT '["log"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monitoring_alert_incidents (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES monitoring_alert_rules(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open',
  event_count INTEGER NOT NULL DEFAULT 0,
  sample_message TEXT,
  sample_event_id TEXT REFERENCES monitoring_events(id) ON DELETE SET NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_monitoring_incidents_status
  ON monitoring_alert_incidents (status, triggered_at DESC);

CREATE TABLE IF NOT EXISTS monitoring_health_checks (
  component TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'unknown',
  message TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO monitoring_alert_rules (id, name, category, min_severity, threshold_count, window_minutes, enabled)
VALUES
  ('rule-api-failures', 'API failure spike', 'api_failure', 'error', 10, 5, TRUE),
  ('rule-auth-errors', 'Authentication error spike', 'authentication', 'warn', 15, 5, TRUE),
  ('rule-db-errors', 'Database connectivity', 'database', 'error', 3, 5, TRUE),
  ('rule-payment-errors', 'Payment processing errors', 'payment', 'error', 3, 10, TRUE),
  ('rule-email-failures', 'Email delivery failures', 'email', 'error', 5, 15, TRUE),
  ('rule-performance', 'Slow request spike', 'performance', 'warn', 20, 10, TRUE)
ON CONFLICT (id) DO NOTHING;
