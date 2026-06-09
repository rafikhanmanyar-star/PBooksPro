-- Free trial: 14-day duration and trial onboarding flow support

UPDATE billing_plans
SET
  description = '14-day trial with core modules',
  features_json = COALESCE(features_json, '{}'::jsonb) || '{"trial_days":14}'::jsonb
WHERE plan_code = 'trial';

-- Align active trial subscriptions created before this migration (optional extension cap)
UPDATE subscriptions s
SET
  trial_end_date = s.start_date + INTERVAL '14 days',
  renewal_date = s.start_date + INTERVAL '14 days',
  updated_at = NOW()
FROM billing_plans p
WHERE s.plan_id = p.id
  AND p.plan_code = 'trial'
  AND s.status = 'trialing'
  AND s.trial_end_date > s.start_date + INTERVAL '14 days';
