-- Migration: Task Initiatives & Projects Module
-- Purpose: Schema for Initiatives, Milestones, and OKR Linkage

BEGIN;

-- ==========================================
-- 1. Initiatives / Projects
-- ==========================================
CREATE TABLE IF NOT EXISTS task_initiatives (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Not Started' CHECK (status IN ('Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled')),
    priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
    health TEXT NOT NULL DEFAULT 'On Track' CHECK (health IN ('On Track', 'At Risk', 'Off Track')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    progress_percentage NUMERIC(5,2) DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    department_id TEXT REFERENCES task_departments(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT valid_initiative_dates CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_task_initiatives_tenant ON task_initiatives(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_initiatives_owner ON task_initiatives(owner_id);
CREATE INDEX IF NOT EXISTS idx_task_initiatives_dates ON task_initiatives(start_date, end_date);

-- ==========================================
-- 2. Initiative Contributors (Many-to-Many)
-- ==========================================
CREATE TABLE IF NOT EXISTS task_initiative_contributors (
    initiative_id TEXT NOT NULL REFERENCES task_initiatives(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'Contributor', -- 'Contributor', 'Reviewer'
    joined_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (initiative_id, user_id)
);

-- ==========================================
-- 3. Initiative -> OKR Linkage (Many-to-Many)
-- ==========================================
-- Initiatives can support multiple OKRs, though usually 1-to-1 or 1-to-many from OKR perspective.
-- This allows flexible alignment.
CREATE TABLE IF NOT EXISTS task_initiative_okr_links (
    initiative_id TEXT NOT NULL REFERENCES task_initiatives(id) ON DELETE CASCADE,
    objective_id TEXT NOT NULL REFERENCES task_objectives(id) ON DELETE CASCADE,
    linked_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (initiative_id, objective_id)
);

-- ==========================================
-- 4. Milestones
-- ==========================================
CREATE TABLE IF NOT EXISTS task_milestones (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    initiative_id TEXT NOT NULL REFERENCES task_initiatives(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'Not Started' CHECK (status IN ('Not Started', 'In Progress', 'Completed', 'On Hold')),
    owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    progress_percentage NUMERIC(5,2) DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    sequence_order INTEGER DEFAULT 0, -- For manual ordering
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_milestones_tenant ON task_milestones(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_milestones_initiative ON task_milestones(initiative_id);

-- Enable RLS
ALTER TABLE task_initiatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_initiative_contributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_initiative_okr_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_milestones ENABLE ROW LEVEL SECURITY;

-- Create Policies (Standard Tenant Isolation)
-- Initiatives
CREATE POLICY tenant_isolation_task_initiatives ON task_initiatives FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));
-- Contributors
CREATE POLICY tenant_isolation_task_initiative_contributors ON task_initiative_contributors FOR ALL USING (
    initiative_id IN (SELECT id FROM task_initiatives WHERE tenant_id = current_setting('app.current_tenant_id', true))
);
-- OKR Links
CREATE POLICY tenant_isolation_task_initiative_okr_links ON task_initiative_okr_links FOR ALL USING (
    initiative_id IN (SELECT id FROM task_initiatives WHERE tenant_id = current_setting('app.current_tenant_id', true))
);
-- Milestones
CREATE POLICY tenant_isolation_task_milestones ON task_milestones FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));

COMMIT;
