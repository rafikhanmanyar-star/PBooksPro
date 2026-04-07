-- Shared system chart: accounts/categories use tenant_id = '__system__' so all orgs share canonical ids (sys-acc-*, sys-cat-*).
-- Remaps FKs from legacy tenantId__logicalId rows, then removes duplicate rows.

INSERT INTO tenants (id, name, created_at, updated_at)
VALUES ('__system__', 'Shared system chart', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  lid TEXT;
  logical_accounts TEXT[] := ARRAY[
    'sys-acc-cash', 'sys-acc-ar', 'sys-acc-ap', 'sys-acc-equity', 'sys-acc-clearing',
    'sys-acc-sec-liability', 'sys-acc-received-assets'
  ];
  logical_categories TEXT[] := ARRAY[
    'sys-cat-rent-inc', 'sys-cat-svc-inc', 'sys-cat-sec-dep', 'sys-cat-proj-list', 'sys-cat-unit-sell',
    'sys-cat-penalty-inc', 'sys-cat-own-eq', 'sys-cat-own-svc-pay', 'sys-cat-sal-adv', 'sys-cat-proj-sal',
    'sys-cat-rent-sal', 'sys-cat-bld-maint', 'sys-cat-bld-util', 'sys-cat-own-pay', 'sys-cat-own-sec-pay',
    'sys-cat-sec-ref', 'sys-cat-prop-rep-own', 'sys-cat-prop-rep-ten', 'sys-cat-brok-fee', 'sys-cat-rebate',
    'sys-cat-pm-cost', 'sys-cat-own-with', 'sys-cat-disc-cust', 'sys-cat-disc-flr', 'sys-cat-disc-lump',
    'sys-cat-disc-misc', 'sys-cat-svc-deduct', 'sys-cat-sal-exp', 'sys-cat-rev-asset-in-kind', 'sys-cat-asset-bs-only',
    'sys-cat-sales-fixed-asset', 'sys-cat-asset-sale-proceeds', 'sys-cat-cost-asset-sold', 'sys-cat-sales-return-refund',
    'sys-cat-sales-return-penalty'
  ];
BEGIN
  FOREACH lid IN ARRAY logical_accounts
  LOOP
    UPDATE transactions SET account_id = lid
      WHERE account_id IN (SELECT id FROM accounts WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
    UPDATE transactions SET from_account_id = lid
      WHERE from_account_id IN (SELECT id FROM accounts WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
    UPDATE transactions SET to_account_id = lid
      WHERE to_account_id IN (SELECT id FROM accounts WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
    UPDATE journal_lines SET account_id = lid
      WHERE account_id IN (SELECT id FROM accounts WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
    UPDATE accounts SET parent_account_id = lid
      WHERE parent_account_id IN (SELECT id FROM accounts WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
    UPDATE project_received_assets SET sale_account_id = lid
      WHERE sale_account_id IN (SELECT id FROM accounts WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
  END LOOP;

  FOREACH lid IN ARRAY logical_categories
  LOOP
    UPDATE transactions SET category_id = lid
      WHERE category_id IN (SELECT id FROM categories WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
    UPDATE invoices SET category_id = lid
      WHERE category_id IN (SELECT id FROM categories WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
    UPDATE bills SET category_id = lid
      WHERE category_id IN (SELECT id FROM categories WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
    UPDATE budgets SET category_id = lid
      WHERE category_id IN (SELECT id FROM categories WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
    UPDATE categories SET parent_category_id = lid
      WHERE parent_category_id IN (SELECT id FROM categories WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
    -- contract_categories: local SQLite junction only (no LAN table)
    -- installment_plans: created in 027; skip until table exists (026 runs before 027 on fresh DBs)
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'installment_plans'
    ) THEN
      UPDATE installment_plans SET customer_discount_category_id = lid
        WHERE customer_discount_category_id IN (SELECT id FROM categories WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
      UPDATE installment_plans SET floor_discount_category_id = lid
        WHERE floor_discount_category_id IN (SELECT id FROM categories WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
      UPDATE installment_plans SET lump_sum_discount_category_id = lid
        WHERE lump_sum_discount_category_id IN (SELECT id FROM categories WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
      UPDATE installment_plans SET misc_discount_category_id = lid
        WHERE misc_discount_category_id IN (SELECT id FROM categories WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
    END IF;
    UPDATE project_agreements SET list_price_category_id = lid
      WHERE list_price_category_id IN (SELECT id FROM categories WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
    UPDATE project_agreements SET customer_discount_category_id = lid
      WHERE customer_discount_category_id IN (SELECT id FROM categories WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
    UPDATE project_agreements SET floor_discount_category_id = lid
      WHERE floor_discount_category_id IN (SELECT id FROM categories WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
    UPDATE project_agreements SET lump_sum_discount_category_id = lid
      WHERE lump_sum_discount_category_id IN (SELECT id FROM categories WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
    UPDATE project_agreements SET misc_discount_category_id = lid
      WHERE misc_discount_category_id IN (SELECT id FROM categories WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
    UPDATE project_agreements SET selling_price_category_id = lid
      WHERE selling_price_category_id IN (SELECT id FROM categories WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
    UPDATE project_agreements SET rebate_category_id = lid
      WHERE rebate_category_id IN (SELECT id FROM categories WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
  END LOOP;

  FOREACH lid IN ARRAY logical_accounts
  LOOP
    UPDATE payroll_tenant_config SET default_account_id = lid
      WHERE default_account_id IN (SELECT id FROM accounts WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
  END LOOP;

  FOREACH lid IN ARRAY logical_categories
  LOOP
    UPDATE payroll_tenant_config SET default_category_id = lid
      WHERE default_category_id IN (SELECT id FROM categories WHERE id <> lid AND id LIKE '%\_\_' || lid ESCAPE '\');
  END LOOP;
END $$;

UPDATE accounts SET tenant_id = '__system__', balance = 0
WHERE id IN (
  SELECT unnest(ARRAY[
    'sys-acc-cash', 'sys-acc-ar', 'sys-acc-ap', 'sys-acc-equity', 'sys-acc-clearing',
    'sys-acc-sec-liability', 'sys-acc-received-assets'
  ])
);

UPDATE categories SET tenant_id = '__system__'
WHERE id LIKE 'sys-cat-%';

-- Remove per-tenant duplicate system account/category rows (FKs already point to canonical ids).
DELETE FROM accounts WHERE id ~ '^.+__sys-acc-';
DELETE FROM categories WHERE id ~ '^.+__sys-cat-';
