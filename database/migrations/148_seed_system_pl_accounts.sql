-- P0-B Migration 4 — Seed P0-A.1 system chart of accounts under __system__ (idempotent).
-- Adds Revenue/COGS/Expense/Other-Income/Other-Expense GL accounts + new control/asset accounts,
-- and backfills account_code on the pre-existing 11 system accounts.
-- Types stored as AccountType enum values: Bank, Cash, Asset, Liability, Equity,
--   Revenue, COGS, Expense, Other Income, Other Expense.
-- Apply with: npm run db:migrate:lan.

INSERT INTO tenants (id, name) VALUES ('__system__', 'Shared system chart') ON CONFLICT (id) DO NOTHING;

-- 1) Backfill account_code (+ canonical type) on existing system accounts. Tenant-scoped, only when unset.
UPDATE accounts SET account_code = '1000', updated_at = NOW() WHERE id = 'sys-acc-cash'                  AND tenant_id = '__system__' AND account_code IS NULL;
UPDATE accounts SET account_code = '1020', updated_at = NOW() WHERE id = 'sys-acc-clearing'              AND tenant_id = '__system__' AND account_code IS NULL;
UPDATE accounts SET account_code = '1100', updated_at = NOW() WHERE id = 'sys-acc-ar'                    AND tenant_id = '__system__' AND account_code IS NULL;
UPDATE accounts SET account_code = '1250', updated_at = NOW() WHERE id = 'sys-acc-received-assets'       AND tenant_id = '__system__' AND account_code IS NULL;
UPDATE accounts SET account_code = '2000', updated_at = NOW() WHERE id = 'sys-acc-ap'                    AND tenant_id = '__system__' AND account_code IS NULL;
UPDATE accounts SET account_code = '2500', updated_at = NOW() WHERE id = 'sys-acc-sec-liability'         AND tenant_id = '__system__' AND account_code IS NULL;
UPDATE accounts SET account_code = '3000', updated_at = NOW() WHERE id = 'sys-acc-equity'                AND tenant_id = '__system__' AND account_code IS NULL;
UPDATE accounts SET account_code = '3100', updated_at = NOW() WHERE id = 'sys-acc-retained-earnings'     AND tenant_id = '__system__' AND account_code IS NULL;
UPDATE accounts SET account_code = '3200', updated_at = NOW() WHERE id = 'sys-acc-current-year-earnings' AND tenant_id = '__system__' AND account_code IS NULL;
UPDATE accounts SET account_code = '3300', updated_at = NOW() WHERE id = 'sys-acc-income-summary'        AND tenant_id = '__system__' AND account_code IS NULL;
UPDATE accounts SET account_code = '3400', updated_at = NOW() WHERE id = 'sys-acc-expense-summary'       AND tenant_id = '__system__' AND account_code IS NULL;

-- 2) Seed new system accounts. Additive; never touches historical postings.
INSERT INTO accounts (id, tenant_id, name, type, account_code, balance, is_permanent, is_active, version)
VALUES
  -- New balance-sheet control / asset accounts (future Payroll/Construction/Inventory/Investment)
  ('sys-acc-bank',             '__system__', 'Bank Accounts',              'Bank',          '1010', 0, TRUE, TRUE, 1),
  ('sys-acc-sec-receivable',   '__system__', 'Security Deposit Receivable','Asset',         '1200', 0, TRUE, TRUE, 1),
  ('sys-acc-inventory',        '__system__', 'Inventory Asset',            'Asset',         '1300', 0, TRUE, TRUE, 1),
  ('sys-acc-wip',              '__system__', 'Construction WIP',           'Asset',         '1400', 0, TRUE, TRUE, 1),
  ('sys-acc-fixed-assets',     '__system__', 'Fixed Assets',               'Asset',         '1500', 0, TRUE, TRUE, 1),
  ('sys-acc-investments',      '__system__', 'Investment Assets',          'Asset',         '1600', 0, TRUE, TRUE, 1),
  ('sys-acc-payroll-payable',  '__system__', 'Payroll Payable',            'Liability',     '2100', 0, TRUE, TRUE, 1),
  ('sys-acc-tax-payable',      '__system__', 'Tax Payable',                'Liability',     '2200', 0, TRUE, TRUE, 1),
  ('sys-acc-eobi-payable',     '__system__', 'EOBI Payable',               'Liability',     '2300', 0, TRUE, TRUE, 1),
  ('sys-acc-pf-payable',       '__system__', 'Provident Fund Payable',     'Liability',     '2400', 0, TRUE, TRUE, 1),
  ('sys-acc-retention-payable','__system__', 'Retention Payable',          'Liability',     '2600', 0, TRUE, TRUE, 1),
  ('sys-acc-loan-payable',     '__system__', 'Loan Payable',               'Liability',     '2700', 0, TRUE, TRUE, 1),

  -- Revenue (credit-normal)
  ('sys-acc-rev-rental',       '__system__', 'Rental Income',              'Revenue',       '4000', 0, TRUE, TRUE, 1),
  ('sys-acc-rev-service',      '__system__', 'Service Charge Income',      'Revenue',       '4010', 0, TRUE, TRUE, 1),
  ('sys-acc-rev-latefee',      '__system__', 'Late Fee Income',            'Revenue',       '4020', 0, TRUE, TRUE, 1),
  ('sys-acc-rev-contract',     '__system__', 'Contract Revenue',           'Revenue',       '4030', 0, TRUE, TRUE, 1),
  ('sys-acc-rev-asset-sale',   '__system__', 'Asset Sale Income',          'Revenue',       '4040', 0, TRUE, TRUE, 1),
  ('sys-acc-rev-other-op',     '__system__', 'Other Operating Revenue',    'Revenue',       '4050', 0, TRUE, TRUE, 1),
  ('sys-acc-rev-uncategorized','__system__', 'Uncategorized Revenue',      'Revenue',       '4090', 0, TRUE, TRUE, 1),

  -- COGS (debit-normal)
  ('sys-acc-cogs-material',    '__system__', 'Material Cost',              'COGS',          '5000', 0, TRUE, TRUE, 1),
  ('sys-acc-cogs-labor',       '__system__', 'Labor Cost',                 'COGS',          '5100', 0, TRUE, TRUE, 1),
  ('sys-acc-cogs-subcontract', '__system__', 'Subcontract Cost',           'COGS',          '5200', 0, TRUE, TRUE, 1),
  ('sys-acc-cogs-goods',       '__system__', 'Cost Of Goods Sold',         'COGS',          '5300', 0, TRUE, TRUE, 1),
  ('sys-acc-cogs-project',     '__system__', 'Project Direct Cost',        'COGS',          '5400', 0, TRUE, TRUE, 1),

  -- Operating Expense (debit-normal)
  ('sys-acc-exp-payroll',      '__system__', 'Payroll Expense',            'Expense',       '6000', 0, TRUE, TRUE, 1),
  ('sys-acc-exp-maintenance',  '__system__', 'Building Maintenance Expense','Expense',      '6100', 0, TRUE, TRUE, 1),
  ('sys-acc-exp-utility',      '__system__', 'Utility Expense',            'Expense',       '6200', 0, TRUE, TRUE, 1),
  ('sys-acc-exp-office',       '__system__', 'Office Expense',             'Expense',       '6300', 0, TRUE, TRUE, 1),
  ('sys-acc-exp-admin',        '__system__', 'Administrative Expense',     'Expense',       '6400', 0, TRUE, TRUE, 1),
  ('sys-acc-exp-marketing',    '__system__', 'Marketing Expense',          'Expense',       '6500', 0, TRUE, TRUE, 1),
  ('sys-acc-exp-professional', '__system__', 'Professional Fees Expense',  'Expense',       '6600', 0, TRUE, TRUE, 1),
  ('sys-acc-exp-depreciation', '__system__', 'Depreciation Expense',       'Expense',       '6700', 0, TRUE, TRUE, 1),
  ('sys-acc-exp-vehicle',      '__system__', 'Vehicle Expense',            'Expense',       '6800', 0, TRUE, TRUE, 1),
  ('sys-acc-exp-other-op',     '__system__', 'Other Operating Expense',    'Expense',       '6900', 0, TRUE, TRUE, 1),
  ('sys-acc-exp-uncategorized','__system__', 'Uncategorized Expense',      'Expense',       '6990', 0, TRUE, TRUE, 1),

  -- Other Income (credit-normal)
  ('sys-acc-oth-inc-dividend', '__system__', 'Dividend Income',            'Other Income',  '8000', 0, TRUE, TRUE, 1),
  ('sys-acc-oth-inc-investment','__system__','Investment Income',          'Other Income',  '8100', 0, TRUE, TRUE, 1),
  ('sys-acc-oth-inc-capgain',  '__system__', 'Capital Gain',               'Other Income',  '8200', 0, TRUE, TRUE, 1),
  ('sys-acc-oth-inc-other',    '__system__', 'Other Non Operating Income', 'Other Income',  '8900', 0, TRUE, TRUE, 1),

  -- Other Expense (debit-normal)
  ('sys-acc-oth-exp-interest', '__system__', 'Interest Expense',           'Other Expense', '9000', 0, TRUE, TRUE, 1),
  ('sys-acc-oth-exp-caploss',  '__system__', 'Capital Loss',               'Other Expense', '9100', 0, TRUE, TRUE, 1),
  ('sys-acc-oth-exp-other',    '__system__', 'Other Non Operating Expense','Other Expense', '9900', 0, TRUE, TRUE, 1)
ON CONFLICT (id) DO NOTHING;
