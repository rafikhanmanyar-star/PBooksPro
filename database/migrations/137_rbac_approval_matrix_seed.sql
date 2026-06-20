-- A5.1.5 — seed default approval matrix for all existing tenants

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    INSERT INTO rbac_approval_matrix (tenant_id, version, is_active)
    VALUES (t.id, 1, TRUE) ON CONFLICT (tenant_id) DO NOTHING;
  END LOOP;
END $$;

-- Capabilities (idempotent via capability_key)
INSERT INTO rbac_approval_capabilities (id, tenant_id, capability_key, entity_type, required_permission, max_level, is_active)
SELECT
  gen_random_uuid()::text,
  t.id,
  cap.capability_key,
  cap.entity_type,
  cap.required_permission,
  cap.max_level,
  TRUE
FROM tenants t
CROSS JOIN (
  VALUES
    ('approve.journals', 'manual_journal', 'accounting.journals.approve', 2),
    ('approve.journals.reversal', 'journal_reversal', 'accounting.journals.approve', 1),
    ('approve.bills', 'bill', 'procurement.bills.approve', 2),
    ('approve.payments', 'payment', 'approve.payments', 2),
    ('approve.procurement', 'purchase_order', 'procurement.purchase_orders.approve', 2),
    ('approve.payroll', 'payroll_run', 'payroll.runs.approve', 2),
    ('approve.agreements', 'rental_agreement', 'rental.agreements.approve', 2)
) AS cap(capability_key, entity_type, required_permission, max_level)
WHERE NOT EXISTS (
  SELECT 1 FROM rbac_approval_capabilities c
  WHERE c.tenant_id = t.id AND c.capability_key = cap.capability_key
);

-- Rules (mandatory journal seeds — H4)
INSERT INTO rbac_approval_rules (
  id, tenant_id, entity_type, priority, approval_level, min_approvers,
  allow_self_approval, required_permission, conditions, is_mandatory, is_active
)
SELECT
  gen_random_uuid()::text,
  t.id,
  r.entity_type,
  r.priority,
  r.approval_level,
  r.min_approvers,
  r.allow_self_approval,
  r.required_permission,
  '{}'::jsonb,
  r.is_mandatory,
  TRUE
FROM tenants t
CROSS JOIN (
  VALUES
    ('manual_journal', 100, 1, 1, FALSE, 'accounting.journals.approve', TRUE),
    ('journal_reversal', 100, 1, 1, FALSE, 'accounting.journals.approve', TRUE),
    ('bill', 100, 1, 1, FALSE, 'procurement.bills.approve', FALSE),
    ('payment', 100, 1, 1, FALSE, 'approve.payments', FALSE),
    ('purchase_order', 100, 1, 1, FALSE, 'procurement.purchase_orders.approve', FALSE),
    ('payroll_run', 100, 1, 1, FALSE, 'payroll.runs.approve', FALSE),
    ('rental_agreement', 100, 1, 1, FALSE, 'rental.agreements.approve', FALSE)
) AS r(entity_type, priority, approval_level, min_approvers, allow_self_approval, required_permission, is_mandatory)
WHERE NOT EXISTS (
  SELECT 1 FROM rbac_approval_rules x
  WHERE x.tenant_id = t.id AND x.entity_type = r.entity_type
    AND x.approval_level = r.approval_level AND x.is_mandatory = r.is_mandatory
);
