-- Migration: Roles and Permissions Evaluation
-- Purpose: Schema for Custom Roles, Permissions, and User Assignments

BEGIN;

-- ==========================================
-- 1. Roles Definition
-- ==========================================
-- Note: 'user_roles' might already exist in a basic form (Admin, Manager, User).
-- We will expand this to support dynamic custom roles with description and hierarchy.

CREATE TABLE IF NOT EXISTS task_roles (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT FALSE, -- System roles cannot be deleted
    parent_role_id TEXT REFERENCES task_roles(id) ON DELETE SET NULL, -- For hierarchy
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 2. Permissions Definition
-- ==========================================
-- Stores the available actions that can be performed in the system.
-- Usually static/seeded data, but we can allow custom permission sets.
CREATE TABLE IF NOT EXISTS task_permissions (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    module TEXT NOT NULL, -- 'Tasks', 'OKRs', 'Initiatives', 'Settings'
    action TEXT NOT NULL, -- 'create', 'read', 'update', 'delete', 'approve', 'admin'
    description TEXT,
    UNIQUE(module, action)
);

-- ==========================================
-- 3. Role Permissions (Join Table)
-- ==========================================
CREATE TABLE IF NOT EXISTS task_role_permissions (
    role_id TEXT NOT NULL REFERENCES task_roles(id) ON DELETE CASCADE,
    permission_id TEXT NOT NULL REFERENCES task_permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- ==========================================
-- 4. User Role Assignments
-- ==========================================
-- Assigns roles to specific users within a tenant.
-- Replaces or augments simple 'role' columns on users table.
CREATE TABLE IF NOT EXISTS task_user_roles (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id TEXT NOT NULL REFERENCES task_roles(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, -- Denormalized for RLS
    assigned_at TIMESTAMP DEFAULT NOW(),
    assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, role_id)
);

-- ==========================================
-- 5. Audit Log for Roles
-- ==========================================
CREATE TABLE IF NOT EXISTS task_role_audit_logs (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    action TEXT NOT NULL, -- 'Role Created', 'Permission Added', 'User Assigned'
    actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    target_role_id TEXT,
    target_user_id TEXT,
    details JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE task_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_role_audit_logs ENABLE ROW LEVEL SECURITY;

-- Create Policies
-- Roles (Viewable by all in tenant, editable by Admin)
DROP POLICY IF EXISTS tenant_isolation_task_roles ON task_roles;
CREATE POLICY tenant_isolation_task_roles ON task_roles FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Role Permissions (Viewable by all)
-- (No tenant_id on permissions table as they are system-wide usually, but mapping is per role)
DROP POLICY IF EXISTS role_perm_visibility ON task_role_permissions;
CREATE POLICY role_perm_visibility ON task_role_permissions FOR SELECT USING (
    EXISTS (SELECT 1 FROM task_roles WHERE id = task_role_permissions.role_id AND tenant_id = current_setting('app.current_tenant_id', true))
);

-- User Roles
DROP POLICY IF EXISTS tenant_isolation_task_user_roles ON task_user_roles;
CREATE POLICY tenant_isolation_task_user_roles ON task_user_roles FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Audit Logs
DROP POLICY IF EXISTS tenant_isolation_task_role_audit ON task_role_audit_logs;
CREATE POLICY tenant_isolation_task_role_audit ON task_role_audit_logs FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));

COMMIT;

-- Seed Basic Permissions (Idempotent)
INSERT INTO task_permissions (id, module, action, description) VALUES
(uuid_generate_v4(), 'Tasks', 'read', 'View tasks'),
(uuid_generate_v4(), 'Tasks', 'write', 'Create and edit tasks'),
(uuid_generate_v4(), 'Tasks', 'delete', 'Delete tasks'),
(uuid_generate_v4(), 'Tasks', 'approve', 'Approve task status'),
(uuid_generate_v4(), 'OKRs', 'read', 'View OKRs'),
(uuid_generate_v4(), 'OKRs', 'write', 'Manage OKRs'),
(uuid_generate_v4(), 'Settings', 'admin', 'Full system configuration')
ON CONFLICT (module, action) DO NOTHING;
