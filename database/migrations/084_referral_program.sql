-- Referral program: codes, invitations, attributions, rewards, fraud controls.

CREATE TABLE IF NOT EXISTS referral_program_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  referrer_reward_type TEXT NOT NULL DEFAULT 'free_months'
    CHECK (referrer_reward_type IN ('free_months', 'discount_credit', 'plan_upgrade')),
  referrer_reward_value JSONB NOT NULL DEFAULT '{"months":1}'::jsonb,
  referee_reward_type TEXT
    CHECK (referee_reward_type IS NULL OR referee_reward_type IN ('free_months', 'discount_credit', 'plan_upgrade')),
  referee_reward_value JSONB NOT NULL DEFAULT '{"months":0}'::jsonb,
  min_days_to_convert INTEGER NOT NULL DEFAULT 14,
  max_referrals_per_month INTEGER NOT NULL DEFAULT 20,
  block_same_email_domain BOOLEAN NOT NULL DEFAULT TRUE,
  require_paid_conversion BOOLEAN NOT NULL DEFAULT TRUE,
  invitation_expiry_days INTEGER NOT NULL DEFAULT 30,
  signup_base_url TEXT NOT NULL DEFAULT 'https://app.pbookspro.com',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO referral_program_config (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS referral_codes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  total_clicks INTEGER NOT NULL DEFAULT 0,
  total_signups INTEGER NOT NULL DEFAULT 0,
  total_conversions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_codes_code_lower
  ON referral_codes (LOWER(code));
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_codes_tenant
  ON referral_codes (tenant_id);

CREATE TABLE IF NOT EXISTS referral_invitations (
  id TEXT PRIMARY KEY,
  referrer_tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  referral_code_id TEXT NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
  invitee_email TEXT NOT NULL,
  invitee_name TEXT,
  invite_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'opened', 'signed_up', 'expired', 'bounced', 'canceled')),
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_invitations_token ON referral_invitations (invite_token);
CREATE INDEX IF NOT EXISTS idx_referral_invitations_referrer
  ON referral_invitations (referrer_tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_invitations_email
  ON referral_invitations (LOWER(invitee_email));

CREATE TABLE IF NOT EXISTS referral_attributions (
  id TEXT PRIMARY KEY,
  referrer_tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  referee_tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  referral_code_id TEXT NOT NULL REFERENCES referral_codes(id) ON DELETE RESTRICT,
  invitation_id TEXT REFERENCES referral_invitations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'signed_up'
    CHECK (status IN ('signed_up', 'trialing', 'converted', 'rewarded', 'rejected', 'fraud_flagged')),
  referee_email TEXT NOT NULL,
  signup_ip_hash TEXT,
  signed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  converted_at TIMESTAMPTZ,
  rewarded_at TIMESTAMPTZ,
  fraud_score INTEGER NOT NULL DEFAULT 0,
  fraud_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_attributions_referee
  ON referral_attributions (referee_tenant_id);
CREATE INDEX IF NOT EXISTS idx_referral_attributions_referrer
  ON referral_attributions (referrer_tenant_id, status, signed_up_at DESC);

CREATE TABLE IF NOT EXISTS referral_events (
  id TEXT PRIMARY KEY,
  referrer_tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  referee_tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  attribution_id TEXT REFERENCES referral_attributions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'code_created', 'link_clicked', 'invite_sent', 'invite_opened',
      'signup_attributed', 'conversion', 'reward_issued', 'reward_applied',
      'fraud_flagged', 'fraud_cleared', 'admin_action'
    )),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_events_referrer
  ON referral_events (referrer_tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_events_type
  ON referral_events (event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS referral_rewards (
  id TEXT PRIMARY KEY,
  attribution_id TEXT NOT NULL REFERENCES referral_attributions(id) ON DELETE CASCADE,
  beneficiary_tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reward_type TEXT NOT NULL
    CHECK (reward_type IN ('free_months', 'discount_credit', 'plan_upgrade')),
  reward_value JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'applied', 'rejected', 'expired')),
  applies_to TEXT NOT NULL DEFAULT 'referrer'
    CHECK (applies_to IN ('referrer', 'referee')),
  approved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  applied_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_beneficiary
  ON referral_rewards (beneficiary_tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_attribution
  ON referral_rewards (attribution_id);

CREATE TABLE IF NOT EXISTS referral_credit_balances (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  discount_credit_cents INTEGER NOT NULL DEFAULT 0,
  free_months_pending INTEGER NOT NULL DEFAULT 0,
  plan_upgrade_pending TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_fraud_reviews (
  id TEXT PRIMARY KEY,
  attribution_id TEXT NOT NULL REFERENCES referral_attributions(id) ON DELETE CASCADE,
  reason_code TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'dismissed', 'confirmed')),
  reviewed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_fraud_open
  ON referral_fraud_reviews (status, created_at DESC)
  WHERE status = 'open';
