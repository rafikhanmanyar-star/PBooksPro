-- Enterprise license enforcement: tenant status + plan quotas.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE billing_plans SET max_users = 3, max_projects = 5 WHERE plan_code IN ('trial', 'starter');
UPDATE billing_plans SET max_users = 10, max_projects = 50 WHERE plan_code = 'professional';
UPDATE billing_plans SET max_users = -1, max_projects = -1, name = 'Business' WHERE plan_code = 'enterprise';

INSERT INTO billing_plans (
  id, plan_code, name, description, monthly_price, annual_price,
  max_users, max_projects, max_storage_gb, features_json, is_active
) VALUES (
  'plan_business',
  'business',
  'Business',
  'Unlimited users and projects for large organizations',
  293.00, 2930.00,
  -1, -1, 500,
  '{"modules":["real_estate","rental"],"priority_support":true}'::jsonb,
  TRUE
)
ON CONFLICT (plan_code) DO UPDATE SET
  max_users = EXCLUDED.max_users,
  max_projects = EXCLUDED.max_projects,
  name = EXCLUDED.name,
  description = EXCLUDED.description;
