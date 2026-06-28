-- P0-B Migration 5 — Seed category_account_mapping for every system category (__system__).
-- Mirrors backend/src/constants/systemChartDefs.ts SYSTEM_CATEGORY_DEFS (36 categories).
-- Idempotent. Asserts at the end that NO system category is left unmapped (fails the migration if so).
-- Apply with: npm run db:migrate:lan.

INSERT INTO category_account_mapping (tenant_id, category_id, gl_account_id)
VALUES
  -- Income categories
  ('__system__', 'sys-cat-rent-inc',              'sys-acc-rev-rental'),
  ('__system__', 'sys-cat-svc-inc',               'sys-acc-rev-service'),
  ('__system__', 'sys-cat-sec-dep',               'sys-acc-sec-liability'),    -- liability, not revenue
  ('__system__', 'sys-cat-proj-list',             'sys-acc-rev-contract'),
  ('__system__', 'sys-cat-unit-sell',             'sys-acc-rev-contract'),
  ('__system__', 'sys-cat-penalty-inc',           'sys-acc-rev-latefee'),
  ('__system__', 'sys-cat-own-eq',                'sys-acc-equity'),           -- owner capital
  ('__system__', 'sys-cat-own-svc-pay',           'sys-acc-rev-service'),
  ('__system__', 'sys-cat-rev-asset-in-kind',     'sys-acc-rev-other-op'),
  ('__system__', 'sys-cat-asset-bs-only',         'sys-acc-received-assets'),  -- balance-sheet only
  ('__system__', 'sys-cat-sales-fixed-asset',     'sys-acc-rev-asset-sale'),
  ('__system__', 'sys-cat-asset-sale-proceeds',   'sys-acc-rev-asset-sale'),
  ('__system__', 'sys-cat-sales-return-refund',   'sys-acc-rev-other-op'),     -- revenue reduction (contra)
  ('__system__', 'sys-cat-sales-return-penalty',  'sys-acc-rev-other-op'),

  -- Expense categories
  ('__system__', 'sys-cat-sal-adv',               'sys-acc-exp-payroll'),
  ('__system__', 'sys-cat-proj-sal',              'sys-acc-cogs-labor'),
  ('__system__', 'sys-cat-rent-sal',              'sys-acc-exp-payroll'),
  ('__system__', 'sys-cat-bld-maint',             'sys-acc-exp-maintenance'),
  ('__system__', 'sys-cat-bld-util',              'sys-acc-exp-utility'),
  ('__system__', 'sys-cat-own-pay',               'sys-acc-equity'),           -- owner distribution
  ('__system__', 'sys-cat-own-sec-pay',           'sys-acc-sec-liability'),
  ('__system__', 'sys-cat-sec-ref',               'sys-acc-sec-liability'),
  ('__system__', 'sys-cat-prop-rep-own',          'sys-acc-exp-maintenance'),
  ('__system__', 'sys-cat-prop-rep-ten',          'sys-acc-exp-maintenance'),
  ('__system__', 'sys-cat-brok-fee',              'sys-acc-exp-professional'),
  ('__system__', 'sys-cat-rebate',                'sys-acc-exp-other-op'),
  ('__system__', 'sys-cat-pm-cost',               'sys-acc-cogs-project'),
  ('__system__', 'sys-cat-own-with',              'sys-acc-equity'),           -- drawings
  ('__system__', 'sys-cat-profit-share',          'sys-acc-exp-other-op'),
  ('__system__', 'sys-cat-disc-cust',             'sys-acc-exp-other-op'),
  ('__system__', 'sys-cat-disc-flr',              'sys-acc-exp-other-op'),
  ('__system__', 'sys-cat-disc-lump',             'sys-acc-exp-other-op'),
  ('__system__', 'sys-cat-disc-misc',             'sys-acc-exp-other-op'),
  ('__system__', 'sys-cat-svc-deduct',            'sys-acc-exp-other-op'),
  ('__system__', 'sys-cat-sal-exp',               'sys-acc-exp-payroll'),
  ('__system__', 'sys-cat-cost-asset-sold',       'sys-acc-cogs-goods')
ON CONFLICT (tenant_id, category_id) DO NOTHING;

-- Assertion: abort if any system category lacks a mapping.
DO $$
DECLARE
  unmapped TEXT;
BEGIN
  SELECT string_agg(c.id, ', ') INTO unmapped
  FROM categories c
  LEFT JOIN category_account_mapping m
    ON m.category_id = c.id AND m.tenant_id = '__system__'
  WHERE c.tenant_id = '__system__' AND c.deleted_at IS NULL AND m.id IS NULL;

  IF unmapped IS NOT NULL THEN
    RAISE EXCEPTION 'Unmapped system categories remain: %', unmapped;
  END IF;
END $$;
