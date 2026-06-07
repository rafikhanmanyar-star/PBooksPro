-- Paddle integration: customer records + webhook idempotency/retry.

CREATE TABLE IF NOT EXISTS billing_customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  paddle_customer_id TEXT UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_customers_paddle ON billing_customers (paddle_customer_id)
  WHERE paddle_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS paddle_webhook_deliveries (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  processed_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paddle_webhook_retry ON paddle_webhook_deliveries (status, next_retry_at)
  WHERE status = 'failed';

CREATE INDEX IF NOT EXISTS idx_paddle_webhook_type ON paddle_webhook_deliveries (event_type, created_at DESC);
