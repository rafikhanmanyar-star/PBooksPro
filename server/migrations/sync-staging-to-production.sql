-- Migration Script: Sync Staging Database to Match Production
-- Generated automatically - Review before running!
-- Date: 2026-01-14T13:01:20.472Z

BEGIN;

-- ============================================================================
-- MISSING TABLES - Creating these tables
-- ============================================================================

-- Table: payment_webhooks
CREATE TABLE IF NOT EXISTS payment_webhooks (
    id TEXT NOT NULL,
    gateway TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    signature TEXT,
    processed BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_gateway ON public.payment_webhooks USING btree (gateway);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_event_type ON public.payment_webhooks USING btree (event_type);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_processed ON public.payment_webhooks USING btree (processed);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_created_at ON public.payment_webhooks USING btree (created_at);


-- Table: payments
CREATE TABLE IF NOT EXISTS payments (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    payment_intent_id TEXT,
    amount NUMERIC NOT NULL,
    currency TEXT NOT NULL DEFAULT 'PKR'::text,
    status TEXT NOT NULL DEFAULT 'pending'::text,
    payment_method TEXT,
    gateway TEXT NOT NULL,
    gateway_transaction_id TEXT,
    license_type TEXT NOT NULL,
    license_duration_months INTEGER NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    paid_at TIMESTAMP WITHOUT TIME ZONE,
    PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_tenant_id_fkey'
  ) THEN
    ALTER TABLE payments ADD CONSTRAINT payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_payment_intent_id_key'
  ) THEN
    ALTER TABLE payments ADD CONSTRAINT payments_payment_intent_id_key UNIQUE (payment_intent_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_license_type'
  ) THEN
    ALTER TABLE payments ADD CONSTRAINT valid_license_type CHECK ((license_type = ANY (ARRAY['trial'::text, 'monthly'::text, 'yearly'::text, 'perpetual'::text])));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_status'
  ) THEN
    ALTER TABLE payments ADD CONSTRAINT valid_status CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'expired'::text, 'revoked'::text])));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_currency'
  ) THEN
    ALTER TABLE payments ADD CONSTRAINT valid_currency CHECK ((currency = ANY (ARRAY['PKR'::text, 'USD'::text])));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON public.payments USING btree (tenant_id);

CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments USING btree (status);

CREATE INDEX IF NOT EXISTS idx_payments_payment_intent_id ON public.payments USING btree (payment_intent_id);

CREATE INDEX IF NOT EXISTS idx_payments_gateway_transaction_id ON public.payments USING btree (gateway_transaction_id);

CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments USING btree (created_at);


-- Table: subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    payment_id TEXT,
    status TEXT NOT NULL DEFAULT 'active'::text,
    billing_cycle TEXT NOT NULL,
    next_billing_date TIMESTAMP WITHOUT TIME ZONE,
    canceled_at TIMESTAMP WITHOUT TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_payment_id_fkey'
  ) THEN
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_tenant_id_fkey'
  ) THEN
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_billing_cycle'
  ) THEN
    ALTER TABLE subscriptions ADD CONSTRAINT valid_billing_cycle CHECK ((billing_cycle = ANY (ARRAY['monthly'::text, 'yearly'::text])));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_subscription_status'
  ) THEN
    ALTER TABLE subscriptions ADD CONSTRAINT valid_subscription_status CHECK ((status = ANY (ARRAY['active'::text, 'canceled'::text, 'expired'::text, 'past_due'::text])));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_id ON public.subscriptions USING btree (tenant_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions USING btree (status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing_date ON public.subscriptions USING btree (next_billing_date);


-- ============================================================================
-- MISSING COLUMNS - Add these columns to staging tables
-- ============================================================================

COMMIT;

-- ============================================================================
-- Migration complete!
-- ============================================================================