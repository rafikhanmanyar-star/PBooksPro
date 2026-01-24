-- Production upgrade: add missing tables/columns from STAGING
-- Generated: 2026-01-24T12:41:12.121Z
-- Additive only. Idempotent. Safe to re-run.

BEGIN;

-- ========== MISSING TABLES (create from staging) ==========
-- Table: payroll_departments
CREATE TABLE IF NOT EXISTS payroll_departments (
    id TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    tenant_id TEXT NOT NULL,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20),
    description VARCHAR(500),
    parent_department_id TEXT,
    head_employee_id TEXT,
    cost_center_code VARCHAR(50),
    budget_allocation NUMERIC DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_by TEXT,
    updated_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_departments_created_by_fkey') THEN
    ALTER TABLE payroll_departments ADD CONSTRAINT payroll_departments_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_departments_parent_department_id_fkey') THEN
    ALTER TABLE payroll_departments ADD CONSTRAINT payroll_departments_parent_department_id_fkey FOREIGN KEY (parent_department_id) REFERENCES payroll_departments(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_departments_tenant_id_fkey') THEN
    ALTER TABLE payroll_departments ADD CONSTRAINT payroll_departments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_departments_updated_by_fkey') THEN
    ALTER TABLE payroll_departments ADD CONSTRAINT payroll_departments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_departments_tenant_id_code_key') THEN
    ALTER TABLE payroll_departments ADD CONSTRAINT payroll_departments_tenant_id_code_key UNIQUE (tenant_id, code);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_departments_tenant_id_name_key') THEN
    ALTER TABLE payroll_departments ADD CONSTRAINT payroll_departments_tenant_id_name_key UNIQUE (tenant_id, name);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payroll_departments_tenant ON public.payroll_departments USING btree (tenant_id);

CREATE INDEX IF NOT EXISTS idx_payroll_departments_parent ON public.payroll_departments USING btree (parent_department_id);

CREATE INDEX IF NOT EXISTS idx_payroll_departments_active ON public.payroll_departments USING btree (tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_payroll_departments_code ON public.payroll_departments USING btree (tenant_id, code);


-- Table: payroll_employees
CREATE TABLE IF NOT EXISTS payroll_employees (
    id TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    photo TEXT,
    employee_code VARCHAR(50),
    designation VARCHAR(255) NOT NULL,
    department VARCHAR(100) NOT NULL,
    grade VARCHAR(50),
    status VARCHAR(20) DEFAULT 'ACTIVE'::character varying,
    joining_date DATE NOT NULL,
    termination_date DATE,
    salary JSONB NOT NULL DEFAULT '{"basic": 0, "allowances": [], "deductions": []}'::jsonb,
    adjustments JSONB DEFAULT '[]'::jsonb,
    projects JSONB DEFAULT '[]'::jsonb,
    created_by TEXT NOT NULL,
    updated_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    department_id TEXT,
    PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_employees_created_by_fkey') THEN
    ALTER TABLE payroll_employees ADD CONSTRAINT payroll_employees_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_employees_department_id_fkey') THEN
    ALTER TABLE payroll_employees ADD CONSTRAINT payroll_employees_department_id_fkey FOREIGN KEY (department_id) REFERENCES payroll_departments(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_employees_tenant_id_fkey') THEN
    ALTER TABLE payroll_employees ADD CONSTRAINT payroll_employees_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_employees_updated_by_fkey') THEN
    ALTER TABLE payroll_employees ADD CONSTRAINT payroll_employees_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_employees_user_id_fkey') THEN
    ALTER TABLE payroll_employees ADD CONSTRAINT payroll_employees_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_employees_status_check') THEN
    ALTER TABLE payroll_employees ADD CONSTRAINT payroll_employees_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'RESIGNED'::character varying, 'TERMINATED'::character varying, 'ON_LEAVE'::character varying])::text[])));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payroll_employees_tenant ON public.payroll_employees USING btree (tenant_id);

CREATE INDEX IF NOT EXISTS idx_payroll_employees_status ON public.payroll_employees USING btree (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_payroll_employees_department ON public.payroll_employees USING btree (tenant_id, department);

CREATE INDEX IF NOT EXISTS idx_payroll_employees_code ON public.payroll_employees USING btree (tenant_id, employee_code);

CREATE INDEX IF NOT EXISTS idx_payroll_employees_department_id ON public.payroll_employees USING btree (department_id);


-- Table: payroll_grades
CREATE TABLE IF NOT EXISTS payroll_grades (
    id TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    tenant_id TEXT NOT NULL,
    name VARCHAR(50) NOT NULL,
    description VARCHAR(255),
    min_salary NUMERIC NOT NULL DEFAULT 0,
    max_salary NUMERIC NOT NULL DEFAULT 0,
    created_by TEXT,
    updated_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_grades_created_by_fkey') THEN
    ALTER TABLE payroll_grades ADD CONSTRAINT payroll_grades_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_grades_tenant_id_fkey') THEN
    ALTER TABLE payroll_grades ADD CONSTRAINT payroll_grades_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_grades_updated_by_fkey') THEN
    ALTER TABLE payroll_grades ADD CONSTRAINT payroll_grades_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_grades_tenant_id_name_key') THEN
    ALTER TABLE payroll_grades ADD CONSTRAINT payroll_grades_tenant_id_name_key UNIQUE (tenant_id, name);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payroll_grades_tenant ON public.payroll_grades USING btree (tenant_id);


-- Table: payroll_projects
CREATE TABLE IF NOT EXISTS payroll_projects (
    id TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    tenant_id TEXT NOT NULL,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    description TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE'::character varying,
    created_by TEXT,
    updated_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_projects_created_by_fkey') THEN
    ALTER TABLE payroll_projects ADD CONSTRAINT payroll_projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_projects_tenant_id_fkey') THEN
    ALTER TABLE payroll_projects ADD CONSTRAINT payroll_projects_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_projects_updated_by_fkey') THEN
    ALTER TABLE payroll_projects ADD CONSTRAINT payroll_projects_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_projects_status_check') THEN
    ALTER TABLE payroll_projects ADD CONSTRAINT payroll_projects_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'COMPLETED'::character varying, 'ON_HOLD'::character varying])::text[])));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payroll_projects_tenant ON public.payroll_projects USING btree (tenant_id);

CREATE INDEX IF NOT EXISTS idx_payroll_projects_status ON public.payroll_projects USING btree (tenant_id, status);


-- Table: payroll_runs
CREATE TABLE IF NOT EXISTS payroll_runs (
    id TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    tenant_id TEXT NOT NULL,
    month VARCHAR(20) NOT NULL,
    year INTEGER NOT NULL,
    period_start DATE,
    period_end DATE,
    status VARCHAR(20) DEFAULT 'DRAFT'::character varying,
    total_amount NUMERIC DEFAULT 0,
    employee_count INTEGER DEFAULT 0,
    created_by TEXT NOT NULL,
    updated_by TEXT,
    approved_by TEXT,
    approved_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_runs_approved_by_fkey') THEN
    ALTER TABLE payroll_runs ADD CONSTRAINT payroll_runs_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES users(id) ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_runs_created_by_fkey') THEN
    ALTER TABLE payroll_runs ADD CONSTRAINT payroll_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_runs_tenant_id_fkey') THEN
    ALTER TABLE payroll_runs ADD CONSTRAINT payroll_runs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_runs_updated_by_fkey') THEN
    ALTER TABLE payroll_runs ADD CONSTRAINT payroll_runs_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_runs_tenant_id_month_year_key') THEN
    ALTER TABLE payroll_runs ADD CONSTRAINT payroll_runs_tenant_id_month_year_key UNIQUE (tenant_id, month, year);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_runs_status_check') THEN
    ALTER TABLE payroll_runs ADD CONSTRAINT payroll_runs_status_check CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'PROCESSING'::character varying, 'APPROVED'::character varying, 'PAID'::character varying, 'CANCELLED'::character varying])::text[])));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payroll_runs_tenant ON public.payroll_runs USING btree (tenant_id);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON public.payroll_runs USING btree (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON public.payroll_runs USING btree (tenant_id, year, month);


-- Table: payroll_salary_components
CREATE TABLE IF NOT EXISTS payroll_salary_components (
    id TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    tenant_id TEXT NOT NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL,
    is_percentage BOOLEAN DEFAULT false,
    default_value NUMERIC DEFAULT 0,
    is_taxable BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_salary_components_tenant_id_fkey') THEN
    ALTER TABLE payroll_salary_components ADD CONSTRAINT payroll_salary_components_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_salary_components_tenant_id_name_type_key') THEN
    ALTER TABLE payroll_salary_components ADD CONSTRAINT payroll_salary_components_tenant_id_name_type_key UNIQUE (tenant_id, name, type);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_salary_components_type_check') THEN
    ALTER TABLE payroll_salary_components ADD CONSTRAINT payroll_salary_components_type_check CHECK (((type)::text = ANY ((ARRAY['ALLOWANCE'::character varying, 'DEDUCTION'::character varying])::text[])));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payroll_components_tenant ON public.payroll_salary_components USING btree (tenant_id);


-- ========== MISSING COLUMNS (add to production) ==========
-- payslips: payroll_run_id, basic_pay, total_adjustments, gross_pay, net_pay, allowance_details, deduction_details, adjustment_details, is_paid, paid_at
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS payroll_run_id TEXT DEFAULT '' NOT NULL;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS basic_pay NUMERIC DEFAULT 0 NOT NULL;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS total_adjustments NUMERIC DEFAULT 0 NOT NULL;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS gross_pay NUMERIC DEFAULT 0 NOT NULL;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS net_pay NUMERIC DEFAULT 0 NOT NULL;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS allowance_details JSONB DEFAULT '[]'::jsonb;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS deduction_details JSONB DEFAULT '[]'::jsonb;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS adjustment_details JSONB DEFAULT '[]'::jsonb;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE;

COMMIT;

-- End of migration.