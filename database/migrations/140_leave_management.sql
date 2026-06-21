-- Payroll V3 Sprint 2 — leave management (attendance integration; no payroll calc impact)

CREATE TABLE IF NOT EXISTS leave_types (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  annual_quota INTEGER NOT NULL DEFAULT 0,
  paid_leave BOOLEAN NOT NULL DEFAULT TRUE,
  carry_forward BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_leave_types_tenant_name_active
  ON leave_types (tenant_id, name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leave_types_tenant ON leave_types (tenant_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE CASCADE,
  leave_type_id TEXT NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  days NUMERIC(5, 2) NOT NULL,
  reason TEXT,
  attachment_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT leave_requests_date_order CHECK (to_date >= from_date)
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_tenant ON leave_requests (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leave_requests_leave_type ON leave_requests (leave_type_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leave_requests_tenant_updated ON leave_requests (tenant_id, updated_at);

CREATE TABLE IF NOT EXISTS leave_balances (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE CASCADE,
  leave_type_id TEXT NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  allocated_days NUMERIC(5, 2) NOT NULL DEFAULT 0,
  used_days NUMERIC(5, 2) NOT NULL DEFAULT 0,
  balance_days NUMERIC(5, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_leave_balances_tenant_employee_type_year_active
  ON leave_balances (tenant_id, employee_id, leave_type_id, year)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leave_balances_tenant ON leave_balances (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leave_balances_employee ON leave_balances (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leave_balances_leave_type ON leave_balances (leave_type_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leave_balances_year ON leave_balances (year) WHERE deleted_at IS NULL;

-- Link auto-created attendance rows back to leave requests (cancel cleanup)
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS leave_request_id TEXT REFERENCES leave_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_records_leave_request
  ON attendance_records (leave_request_id)
  WHERE deleted_at IS NULL AND leave_request_id IS NOT NULL;

-- RBAC v2: seed leave permissions (idempotent)
INSERT INTO rbac_role_permissions (tenant_id, role_id, permission_key)
SELECT r.tenant_id, r.id, p.key
FROM rbac_roles r
CROSS JOIN (
  VALUES
    ('leave.read'),
    ('leave.write'),
    ('leave.delete'),
    ('leave.approve'),
    ('leave.manage')
) AS p(key)
WHERE r.slug IN ('super_admin', 'company_admin', 'SYSTEM_OWNER')
ON CONFLICT DO NOTHING;

INSERT INTO rbac_role_permissions (tenant_id, role_id, permission_key)
SELECT r.tenant_id, r.id, 'leave.read'
FROM rbac_roles r
WHERE r.slug IN ('accountant')
ON CONFLICT DO NOTHING;

INSERT INTO rbac_role_permissions (tenant_id, role_id, permission_key)
SELECT r.tenant_id, r.id, p.key
FROM rbac_roles r
CROSS JOIN (VALUES ('leave.read'), ('leave.approve')) AS p(key)
WHERE r.slug IN ('company_admin', 'department_manager')
ON CONFLICT DO NOTHING;
