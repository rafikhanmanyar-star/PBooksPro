-- RK Builders cloud login: organization email required for unified login (company email + username + password).
UPDATE tenants
SET
  email = 'rkbuilders@pbookspro.com',
  company_name = COALESCE(NULLIF(TRIM(company_name), ''), 'RK Builders'),
  updated_at = NOW()
WHERE id = 'rk-builders-284d6d'
  AND (email IS NULL OR TRIM(email) = '' OR LOWER(TRIM(email)) <> 'rkbuilders@pbookspro.com');
