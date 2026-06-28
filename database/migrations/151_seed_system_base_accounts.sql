-- Seed the core/base system chart of accounts under __system__ (idempotent).
-- Fixes the long-standing asymmetry where system *categories* are guaranteed by migrations
-- (012/026/143) but the base system *accounts* were only ever created by the runtime
-- bootstrap (insertSystemAccounts) at registration. On environments where that bootstrap
-- never fully populated __system__, tenants ended up with income/expense categories but no
-- chart of accounts. These ids match SYSTEM_ACCOUNT_DEFS and the account_codes from
-- migration 148, so the row set is identical regardless of which path created it.
-- Apply with: npm run db:migrate:lan.

INSERT INTO tenants (id, name) VALUES ('__system__', 'Shared system chart')
ON CONFLICT (id) DO NOTHING;

INSERT INTO accounts (id, tenant_id, name, type, account_code, balance, is_permanent, version)
VALUES
  ('sys-acc-cash',                 '__system__', 'Cash',                   'BANK',      '1000', 0, TRUE, 1),
  ('sys-acc-clearing',             '__system__', 'Internal Clearing',      'BANK',      '1020', 0, TRUE, 1),
  ('sys-acc-ar',                   '__system__', 'Accounts Receivable',    'ASSET',     '1100', 0, TRUE, 1),
  ('sys-acc-received-assets',      '__system__', 'Project Received Assets','ASSET',     '1250', 0, TRUE, 1),
  ('sys-acc-ap',                   '__system__', 'Accounts Payable',       'LIABILITY', '2000', 0, TRUE, 1),
  ('sys-acc-sec-liability',        '__system__', 'Security Liability',     'LIABILITY', '2500', 0, TRUE, 1),
  ('sys-acc-equity',               '__system__', 'Owner Equity',           'EQUITY',    '3000', 0, TRUE, 1),
  ('sys-acc-retained-earnings',    '__system__', 'Retained Earnings',      'EQUITY',    '3100', 0, TRUE, 1),
  ('sys-acc-current-year-earnings','__system__', 'Current Year Earnings',  'EQUITY',    '3200', 0, TRUE, 1),
  ('sys-acc-income-summary',       '__system__', 'Income Summary',         'EQUITY',    '3300', 0, TRUE, 1),
  ('sys-acc-expense-summary',      '__system__', 'Expense Summary',        'EQUITY',    '3400', 0, TRUE, 1)
ON CONFLICT (id) DO NOTHING;
