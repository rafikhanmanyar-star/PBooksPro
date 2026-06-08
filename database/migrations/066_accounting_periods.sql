-- Fiscal accounting periods (open / closed) and year-end close support.

CREATE TABLE IF NOT EXISTS accounting_periods (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  closing_journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL,
  year_end_transfer_journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL,
  reopened_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reopened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT accounting_periods_dates CHECK (start_date <= end_date),
  CONSTRAINT accounting_periods_tenant_range UNIQUE (tenant_id, start_date, end_date)
);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_tenant_status
  ON accounting_periods(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_tenant_dates
  ON accounting_periods(tenant_id, start_date, end_date);

COMMENT ON TABLE accounting_periods IS 'Fiscal periods; closed periods block journal and transaction posting.';

-- Equity accounts for period close (shared system chart).
INSERT INTO accounts (id, tenant_id, name, type, balance, is_permanent, version)
VALUES
  ('sys-acc-retained-earnings', '__system__', 'Retained Earnings', 'EQUITY', 0, TRUE, 1),
  ('sys-acc-current-year-earnings', '__system__', 'Current Year Earnings', 'EQUITY', 0, TRUE, 1),
  ('sys-acc-income-summary', '__system__', 'Income Summary', 'EQUITY', 0, TRUE, 1),
  ('sys-acc-expense-summary', '__system__', 'Expense Summary', 'EQUITY', 0, TRUE, 1)
ON CONFLICT (id) DO NOTHING;
