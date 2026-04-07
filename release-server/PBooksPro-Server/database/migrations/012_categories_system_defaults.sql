-- Idempotent seed: system income/expense categories for default tenant (matches SQLite / AppContext defaults).
-- Safe to re-run; skips existing ids.

INSERT INTO categories (id, tenant_id, name, type, is_permanent, is_rental, is_hidden, version)
VALUES
  ('sys-cat-rent-inc', 'default', 'Rental Income', 'Income', TRUE, TRUE, FALSE, 1),
  ('sys-cat-svc-inc', 'default', 'Service Charge Income', 'Income', TRUE, TRUE, FALSE, 1),
  ('sys-cat-sec-dep', 'default', 'Security Deposit', 'Income', TRUE, TRUE, FALSE, 1),
  ('sys-cat-proj-list', 'default', 'Project Listed Income', 'Income', TRUE, FALSE, FALSE, 1),
  ('sys-cat-unit-sell', 'default', 'Unit Selling Income', 'Income', TRUE, FALSE, FALSE, 1),
  ('sys-cat-penalty-inc', 'default', 'Penalty Income', 'Income', TRUE, FALSE, FALSE, 1),
  ('sys-cat-own-eq', 'default', 'Owner Equity', 'Income', TRUE, FALSE, FALSE, 1),
  ('sys-cat-own-svc-pay', 'default', 'Owner Service Charge Payment', 'Income', TRUE, TRUE, FALSE, 1),
  ('sys-cat-sal-adv', 'default', 'Salary Advance', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-proj-sal', 'default', 'Project Staff Salary', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-rent-sal', 'default', 'Rental Staff Salary', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-bld-maint', 'default', 'Building Maintenance', 'Expense', TRUE, TRUE, FALSE, 1),
  ('sys-cat-bld-util', 'default', 'Building Utilities', 'Expense', TRUE, TRUE, FALSE, 1),
  ('sys-cat-own-pay', 'default', 'Owner Payout', 'Expense', TRUE, TRUE, FALSE, 1),
  ('sys-cat-own-sec-pay', 'default', 'Owner Security Payout', 'Expense', TRUE, TRUE, FALSE, 1),
  ('sys-cat-sec-ref', 'default', 'Security Deposit Refund', 'Expense', TRUE, TRUE, FALSE, 1),
  ('sys-cat-prop-rep-own', 'default', 'Property Repair (Owner)', 'Expense', TRUE, TRUE, FALSE, 1),
  ('sys-cat-prop-rep-ten', 'default', 'Property Repair (Tenant)', 'Expense', TRUE, TRUE, FALSE, 1),
  ('sys-cat-brok-fee', 'default', 'Broker Fee', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-rebate', 'default', 'Rebate Amount', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-pm-cost', 'default', 'Project Management Cost', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-own-with', 'default', 'Owner Withdrawn', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-disc-cust', 'default', 'Customer Discount', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-disc-flr', 'default', 'Floor Discount', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-disc-lump', 'default', 'Lump Sum Discount', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-disc-misc', 'default', 'Misc Discount', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-svc-deduct', 'default', 'Service Charge Deduction', 'Expense', TRUE, TRUE, FALSE, 1),
  ('sys-cat-sal-exp', 'default', 'Salary Expenses', 'Expense', TRUE, FALSE, FALSE, 1),
  ('sys-cat-rev-asset-in-kind', 'default', 'Revenue - Asset received in kind', 'Income', TRUE, FALSE, FALSE, 1),
  ('sys-cat-asset-bs-only', 'default', 'Asset received (balance sheet only)', 'Income', TRUE, FALSE, FALSE, 1),
  ('sys-cat-sales-fixed-asset', 'default', 'Sales of fixed asset', 'Income', TRUE, FALSE, FALSE, 1),
  ('sys-cat-asset-sale-proceeds', 'default', 'Asset Sale Proceeds', 'Income', TRUE, FALSE, FALSE, 1),
  ('sys-cat-cost-asset-sold', 'default', 'Cost of Asset Sold', 'Expense', TRUE, FALSE, FALSE, 1)
ON CONFLICT (id) DO NOTHING;
