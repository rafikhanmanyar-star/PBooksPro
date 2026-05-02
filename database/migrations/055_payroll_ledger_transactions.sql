-- Payroll employee ledger (payslip / payment advances as running balance debit-credit).

CREATE TABLE IF NOT EXISTS payroll_transactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE CASCADE,
  payroll_run_id TEXT REFERENCES payroll_runs(id) ON DELETE SET NULL,
  transaction_date DATE NOT NULL,
  transaction_type TEXT NOT NULL CHECK (
    transaction_type IN (
      'PAYSLIP',
      'PAYMENT',
      'ADVANCE',
      'ADVANCE_ADJUSTMENT',
      'MANUAL_ADJUSTMENT'
    )
  ),
  reference_id TEXT,
  description TEXT,
  debit NUMERIC(18, 2) NOT NULL DEFAULT 0,
  credit NUMERIC(18, 2) NOT NULL DEFAULT 0,
  balance_after NUMERIC(18, 2) NOT NULL,
  source_transaction_id TEXT,
  payslip_created_at TIMESTAMPTZ,
  ledger_sort_ts BIGINT NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_transactions_tenant_employee_date ON payroll_transactions (tenant_id, employee_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_payroll_transactions_tenant_employee_created ON payroll_transactions (tenant_id, employee_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payroll_transactions_tenant_employee_sort ON payroll_transactions (tenant_id, employee_id, transaction_date, ledger_sort_ts, id);
