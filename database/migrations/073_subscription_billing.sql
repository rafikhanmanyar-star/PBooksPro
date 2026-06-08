-- Subscription billing platform (Paddle-ready schema).

CREATE TABLE IF NOT EXISTS billing_plans (
  id TEXT PRIMARY KEY,
  plan_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  monthly_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  annual_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  max_users INTEGER NOT NULL DEFAULT 5,
  max_projects INTEGER NOT NULL DEFAULT 10,
  max_storage_gb INTEGER NOT NULL DEFAULT 10,
  features_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES billing_plans(id),
  status TEXT NOT NULL CHECK (status IN (
    'trialing', 'active', 'past_due', 'canceled', 'paused', 'expired', 'pending'
  )),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('trial', 'monthly', 'annual')),
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  renewal_date TIMESTAMPTZ,
  trial_end_date TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  paddle_customer_id TEXT,
  paddle_subscription_id TEXT,
  pending_plan_id TEXT REFERENCES billing_plans(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_tenant_active
  ON subscriptions (tenant_id)
  WHERE status IN ('trialing', 'active', 'past_due', 'paused', 'pending');

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions (tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_paddle_sub ON subscriptions (paddle_subscription_id)
  WHERE paddle_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS subscription_invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
  invoice_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_date TIMESTAMPTZ,
  paddle_transaction_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_invoices_number ON subscription_invoices (invoice_number);
CREATE INDEX IF NOT EXISTS idx_subscription_invoices_tenant ON subscription_invoices (tenant_id, invoice_date DESC);

CREATE TABLE IF NOT EXISTS subscription_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_source TEXT NOT NULL DEFAULT 'system',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_tenant ON subscription_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_events_type ON subscription_events (event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS subscription_usage_metrics (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  users_count INTEGER NOT NULL DEFAULT 0,
  projects_count INTEGER NOT NULL DEFAULT 0,
  storage_bytes BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, metric_date)
);

-- Seed billing plans
INSERT INTO billing_plans (
  id, plan_code, name, description, monthly_price, annual_price,
  max_users, max_projects, max_storage_gb, features_json, is_active
) VALUES
  (
    'plan_trial',
    'trial',
    'Free Trial',
    '30-day trial with core modules',
    0, 0, 3, 5, 5,
    '{"modules":["real_estate","rental"],"trial_days":30}'::jsonb,
    TRUE
  ),
  (
    'plan_starter',
    'starter',
    'Starter',
    'Small teams — rental & project basics',
    24.00, 240.00,
    10, 25, 25,
    '{"modules":["real_estate","rental"]}'::jsonb,
    TRUE
  ),
  (
    'plan_professional',
    'professional',
    'Professional',
    'Full PBooksPro for growing property businesses',
    71.00, 708.00,
    50, 100, 100,
    '{"modules":["real_estate","rental"]}'::jsonb,
    TRUE
  ),
  (
    'plan_enterprise',
    'enterprise',
    'Enterprise',
    'Unlimited users and priority support',
    293.00, 2930.00,
    -1, -1, 500,
    '{"modules":["real_estate","rental"],"priority_support":true}'::jsonb,
    TRUE
  )
ON CONFLICT (plan_code) DO NOTHING;

-- Backfill trial subscriptions for existing tenants
INSERT INTO subscriptions (id, tenant_id, plan_id, status, billing_cycle, start_date, trial_end_date, renewal_date)
SELECT
  'sub_' || t.id,
  t.id,
  'plan_trial',
  'trialing',
  'trial',
  COALESCE(t.created_at, NOW()),
  COALESCE(t.created_at, NOW()) + INTERVAL '30 days',
  COALESCE(t.created_at, NOW()) + INTERVAL '30 days'
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions s WHERE s.tenant_id = t.id
);
