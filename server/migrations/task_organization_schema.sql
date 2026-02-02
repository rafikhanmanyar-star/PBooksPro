-- Migration: Task Organization & Alignment Module
-- Purpose: Schema for Departments, Teams, Roles, Periods, and Calendar

BEGIN;

-- ==========================================
-- 1. Departments
-- ==========================================
CREATE TABLE IF NOT EXISTS task_departments (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES task_departments(id) ON DELETE SET NULL,
    head_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_departments_tenant ON task_departments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_departments_parent ON task_departments(parent_id);

-- ==========================================
-- 2. Teams
-- ==========================================
CREATE TABLE IF NOT EXISTS task_teams (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    department_id TEXT REFERENCES task_departments(id) ON DELETE SET NULL,
    manager_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_teams_tenant ON task_teams(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_teams_department ON task_teams(department_id);

-- Team Members Junction
CREATE TABLE IF NOT EXISTS task_team_members (
    team_id TEXT NOT NULL REFERENCES task_teams(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'Member', -- 'Member', 'Lead'
    joined_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (team_id, user_id)
);

-- ==========================================
-- 3. Roles & Permissions (Specific to Tasks)
-- ==========================================
CREATE TABLE IF NOT EXISTS task_roles (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('Company', 'Department', 'Team')),
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE TABLE IF NOT EXISTS task_role_assignments (
    role_id TEXT NOT NULL REFERENCES task_roles(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT NOW(),
    assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (role_id, user_id)
);

-- ==========================================
-- 4. Strategy / OKR Periods
-- ==========================================
CREATE TABLE IF NOT EXISTS task_periods (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g., 'Q1 2026', 'Fiscal Year 2026'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    type TEXT NOT NULL DEFAULT 'OKR' CHECK (type IN ('OKR', 'Fiscal', 'Strategy')),
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Closed')),
    parent_period_id TEXT REFERENCES task_periods(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_period_dates CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_task_periods_tenant ON task_periods(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_periods_dates ON task_periods(start_date, end_date);

-- ==========================================
-- 5. Business Calendar (Holidays)
-- ==========================================
CREATE TABLE IF NOT EXISTS task_holidays (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    date DATE NOT NULL,
    type TEXT NOT NULL DEFAULT 'Public' CHECK (type IN ('Public', 'Company', 'Optional')),
    is_recurring BOOLEAN DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, date) -- Assuming one main holiday definition per date per tenant
);

CREATE INDEX IF NOT EXISTS idx_task_holidays_tenant ON task_holidays(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_holidays_date ON task_holidays(date);

-- Enable RLS
ALTER TABLE task_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_holidays ENABLE ROW LEVEL SECURITY;

-- Create Policies (Standard Tenant Isolation)
-- Departments
CREATE POLICY tenant_isolation_task_departments ON task_departments FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));
-- Teams
CREATE POLICY tenant_isolation_task_teams ON task_teams FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));
-- Team Members
CREATE POLICY tenant_isolation_task_team_members ON task_team_members FOR ALL USING (
    team_id IN (SELECT id FROM task_teams WHERE tenant_id = current_setting('app.current_tenant_id', true))
);
-- Roles
CREATE POLICY tenant_isolation_task_roles ON task_roles FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));
-- Role Assignments
CREATE POLICY tenant_isolation_task_role_assignments ON task_role_assignments FOR ALL USING (
    role_id IN (SELECT id FROM task_roles WHERE tenant_id = current_setting('app.current_tenant_id', true))
);
-- Periods
CREATE POLICY tenant_isolation_task_periods ON task_periods FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));
-- Holidays
CREATE POLICY tenant_isolation_task_holidays ON task_holidays FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));

COMMIT;
