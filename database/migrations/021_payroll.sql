-- Payroll module — LAN / PostgreSQL (aligned with electron/schema.sql payroll tables + JSONB)

-- Tenant-scoped config: earning/deduction type lists and default GL links
CREATE TABLE IF NOT EXISTS payroll_tenant_config (
  tenant_id TEXT PRIMARY KEY,
  earning_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  deduction_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_account_id TEXT,
  default_category_id TEXT,
  default_project_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_tenant_config_updated ON payroll_tenant_config(tenant_id, updated_at);

CREATE TABLE IF NOT EXISTS payroll_departments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  parent_department_id TEXT REFERENCES payroll_departments(id) ON DELETE SET NULL,
  head_employee_id TEXT,
  cost_center_code TEXT,
  budget_allocation NUMERIC(18, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  updated_by TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_payroll_departments_tenant_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_payroll_departments_tenant_updated ON payroll_departments(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_payroll_departments_tenant_active ON payroll_departments(tenant_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS payroll_grades (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  description TEXT,
  min_salary NUMERIC(18, 2) NOT NULL DEFAULT 0,
  max_salary NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_by TEXT,
  updated_by TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_payroll_grades_tenant_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_payroll_grades_tenant_updated ON payroll_grades(tenant_id, updated_at);

CREATE TABLE IF NOT EXISTS payroll_employees (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  user_id TEXT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  photo TEXT,
  employee_code TEXT,
  designation TEXT NOT NULL,
  department TEXT NOT NULL,
  department_id TEXT REFERENCES payroll_departments(id) ON DELETE SET NULL,
  grade TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  joining_date DATE NOT NULL,
  termination_date DATE,
  salary JSONB NOT NULL DEFAULT '{"basic":0,"allowances":[],"deductions":[]}'::jsonb,
  adjustments JSONB NOT NULL DEFAULT '[]'::jsonb,
  projects JSONB NOT NULL DEFAULT '[]'::jsonb,
  buildings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_employees_tenant_updated ON payroll_employees(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_payroll_employees_tenant ON payroll_employees(tenant_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS payroll_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  month TEXT NOT NULL,
  year INTEGER NOT NULL,
  period_start DATE,
  period_end DATE,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  total_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  employee_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  updated_by TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_payroll_runs_tenant_period UNIQUE (tenant_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_tenant_updated ON payroll_runs(tenant_id, updated_at);

CREATE TABLE IF NOT EXISTS payslips (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  payroll_run_id TEXT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE CASCADE,
  basic_pay NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_allowances NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_adjustments NUMERIC(18, 2) NOT NULL DEFAULT 0,
  gross_pay NUMERIC(18, 2) NOT NULL DEFAULT 0,
  net_pay NUMERIC(18, 2) NOT NULL DEFAULT 0,
  allowance_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  deduction_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  adjustment_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  paid_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ,
  transaction_id TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_payslips_run_employee UNIQUE (payroll_run_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_payslips_tenant_updated ON payslips(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_payslips_run ON payslips(payroll_run_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS payroll_salary_components (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  is_percentage BOOLEAN NOT NULL DEFAULT FALSE,
  default_value NUMERIC(18, 6) NOT NULL DEFAULT 0,
  is_taxable BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_payroll_salary_components_tenant_name_type UNIQUE (tenant_id, name, type)
);

CREATE INDEX IF NOT EXISTS idx_payroll_salary_components_tenant_updated ON payroll_salary_components(tenant_id, updated_at);

-- Optional payroll-only projects (fallback when main projects list is empty)
CREATE TABLE IF NOT EXISTS payroll_projects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by TEXT,
  updated_by TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_projects_tenant_updated ON payroll_projects(tenant_id, updated_at);
