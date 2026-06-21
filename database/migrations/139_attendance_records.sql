-- Payroll V3 Sprint 1 — attendance records (informational; no payroll calculation impact)

CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (
    status IN ('PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY', 'LATE')
  ),
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  remarks TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_records_tenant_employee_date_active
  ON attendance_records (tenant_id, employee_id, attendance_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_records_tenant ON attendance_records (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_records_employee ON attendance_records (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON attendance_records (attendance_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_records_tenant_date ON attendance_records (tenant_id, attendance_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_records_tenant_updated ON attendance_records (tenant_id, updated_at);

-- RBAC v2: seed attendance permissions for system roles (idempotent)
INSERT INTO rbac_role_permissions (tenant_id, role_id, permission_key)
SELECT r.tenant_id, r.id, p.key
FROM rbac_roles r
CROSS JOIN (
  VALUES
    ('attendance.read'),
    ('attendance.write'),
    ('attendance.delete'),
    ('attendance.manage')
) AS p(key)
WHERE r.slug IN ('super_admin', 'company_admin', 'SYSTEM_OWNER')
ON CONFLICT DO NOTHING;

INSERT INTO rbac_role_permissions (tenant_id, role_id, permission_key)
SELECT r.tenant_id, r.id, 'attendance.read'
FROM rbac_roles r
WHERE r.slug = 'accountant'
ON CONFLICT DO NOTHING;
