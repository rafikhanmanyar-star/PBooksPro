-- Idempotent seed: system income/expense categories shared across all tenants.
-- Uses tenant_id = '__system__' so every org's listCategories query (tenant OR __system__) finds them.
-- Safe to re-run; skips existing ids.

INSERT INTO tenants (id, name) VALUES ('__system__', 'Shared system chart') ON CONFLICT (id) DO NOTHING;

INSERT INTO categories (id, tenant_id, name, type, is_permanent, is_rental, is_hidden, version)
VALUES
  ('sys-cat-rent-inc', '__system__', 'Rental Income', 'Income', TRUE, TRUE, FALSE, 1),
  ('sys-cat-svc-inc', '__system__', 'Service Charge Income', 'Income', TRUE, TRUE, FALSE, 1),
  ('sys-cat-sec-dep', '__system__', 'Security Deposit', 'Income', TRUE, TRUE, FALSE, 1),
  ('sys-cat-proj-list', '__system__', 'Project Listed Income', 'Income', TRUE, FALSE, FALSE, 1),
  ('sys-cat-unit-sell', '__system__', 'Unit Selling Income', 'Income', TRUE, FALSE, FALSE, 1),
  ('sys-cat-penalty-inc', '__system__', 'Penalty Income', 'Income', TRUE, FALSE, FALSE, 1),
  ('sys-cat-own-eq', '__system__', 'Owner Equity', 'Income', TRUE, FALSE, FALSE, 1),
  ('sys-cat-own-svc-pay', '__system__', 'Owner Service Charge Payment', 'Income', TRUE, TRUE, FALSE, 1),
  ('sys-cat-sal-adv', '__system__', 'Salary Advance', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-proj-sal', '__system__', 'Project Staff Salary', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-rent-sal', '__system__', 'Rental Staff Salary', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-bld-maint', '__system__', 'Building Maintenance', 'Expense', TRUE, TRUE, FALSE, 1),
  ('sys-cat-bld-util', '__system__', 'Building Utilities', 'Expense', TRUE, TRUE, FALSE, 1),
  ('sys-cat-own-pay', '__system__', 'Owner Payout', 'Expense', TRUE, TRUE, FALSE, 1),
  ('sys-cat-own-sec-pay', '__system__', 'Owner Security Payout', 'Expense', TRUE, TRUE, FALSE, 1),
  ('sys-cat-sec-ref', '__system__', 'Security Deposit Refund', 'Expense', TRUE, TRUE, FALSE, 1),
  ('sys-cat-prop-rep-own', '__system__', 'Property Repair (Owner)', 'Expense', TRUE, TRUE, FALSE, 1),
  ('sys-cat-prop-rep-ten', '__system__', 'Property Repair (Tenant)', 'Expense', TRUE, TRUE, FALSE, 1),
  ('sys-cat-brok-fee', '__system__', 'Broker Fee', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-rebate', '__system__', 'Rebate Amount', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-pm-cost', '__system__', 'Project Management Cost', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-own-with', '__system__', 'Owner Withdrawn', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-disc-cust', '__system__', 'Customer Discount', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-disc-flr', '__system__', 'Floor Discount', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-disc-lump', '__system__', 'Lump Sum Discount', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-disc-misc', '__system__', 'Misc Discount', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-svc-deduct', '__system__', 'Service Charge Deduction', 'Expense', TRUE, TRUE, FALSE, 1),
  ('sys-cat-sal-exp', '__system__', 'Salary Expenses', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-rev-asset-in-kind', '__system__', 'Revenue - Asset received in kind', 'Income', TRUE, FALSE, FALSE, 1),
  ('sys-cat-asset-bs-only', '__system__', 'Asset received (balance sheet only)', 'Income', TRUE, FALSE, FALSE, 1),
  ('sys-cat-sales-fixed-asset', '__system__', 'Sales of fixed asset', 'Income', TRUE, FALSE, FALSE, 1),
  ('sys-cat-asset-sale-proceeds', '__system__', 'Asset Sale Proceeds', 'Income', TRUE, FALSE, FALSE, 1),
  ('sys-cat-cost-asset-sold', '__system__', 'Cost of Asset Sold', 'Expense', TRUE, FALSE, FALSE, 1)
ON CONFLICT (id) DO NOTHING;
