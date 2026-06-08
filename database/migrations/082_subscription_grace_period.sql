-- Subscription grace period + consolidate STARTER / PROFESSIONAL / ENTERPRISE plans.

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS past_due_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_subscriptions_past_due_at
  ON subscriptions (past_due_at)
  WHERE status = 'past_due' AND past_due_at IS NOT NULL;

-- Restore enterprise branding (075 renamed it to Business).
UPDATE billing_plans
SET
  name = 'Enterprise',
  description = 'Unlimited users and priority support',
  max_users = -1,
  max_projects = -1,
  features_json = '{"modules":["real_estate","rental"],"priority_support":true}'::jsonb
WHERE plan_code = 'enterprise';

-- Deactivate legacy duplicate plan code.
UPDATE billing_plans SET is_active = FALSE WHERE plan_code = 'business';
