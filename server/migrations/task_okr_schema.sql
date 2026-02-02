-- Migration: Task OKR Management Module
-- Purpose: Schema for Objectives, Key Results, Alignment, and Progress Tracking

BEGIN;

-- ==========================================
-- 1. Objectives
-- ==========================================
CREATE TABLE IF NOT EXISTS task_objectives (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    parent_objective_id TEXT REFERENCES task_objectives(id) ON DELETE SET NULL, -- For alignment (Company -> Dept -> Team -> Individual)
    period_id TEXT REFERENCES task_periods(id) ON DELETE SET NULL,
    type TEXT NOT NULL DEFAULT 'Operational' CHECK (type IN ('Strategic', 'Operational')),
    level TEXT NOT NULL CHECK (level IN ('Company', 'Department', 'Team', 'Individual')),
    entity_id TEXT, -- ID of the department/team/user this objective belongs to
    status TEXT NOT NULL DEFAULT 'Not Started' CHECK (status IN ('Not Started', 'In Progress', 'At Risk', 'Completed', 'Cancelled')),
    progress_percentage NUMERIC(5,2) DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    confidence_score INTEGER DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100), -- 0-100% slider
    visibility TEXT NOT NULL DEFAULT 'Public' CHECK (visibility IN ('Public', 'Private', 'Restricted')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_task_objectives_tenant ON task_objectives(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_objectives_owner ON task_objectives(owner_id);
CREATE INDEX IF NOT EXISTS idx_task_objectives_parent ON task_objectives(parent_objective_id);
CREATE INDEX IF NOT EXISTS idx_task_objectives_period ON task_objectives(period_id);

-- ==========================================
-- 2. Key Results (KRs)
-- ==========================================
CREATE TABLE IF NOT EXISTS task_key_results (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    objective_id TEXT NOT NULL REFERENCES task_objectives(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    metric_type TEXT NOT NULL DEFAULT 'Number' CHECK (metric_type IN ('Number', 'Percentage', 'Currency', 'Boolean')),
    start_value NUMERIC(15,2) NOT NULL DEFAULT 0,
    target_value NUMERIC(15,2) NOT NULL,
    current_value NUMERIC(15,2) NOT NULL DEFAULT 0,
    progress_percentage NUMERIC(5,2) DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    confidence_score INTEGER DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
    weight INTEGER DEFAULT 1, -- Contribution weight to parent objective
    status TEXT NOT NULL DEFAULT 'Not Started' CHECK (status IN ('Not Started', 'In Progress', 'At Risk', 'Completed', 'Cancelled')),
    due_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_task_key_results_tenant ON task_key_results(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_key_results_objective ON task_key_results(objective_id);

-- ==========================================
-- 3. OKR Check-ins / Updates (Activity Log)
-- ==========================================
CREATE TABLE IF NOT EXISTS task_okr_updates (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('Objective', 'KeyResult')),
    entity_id TEXT NOT NULL,
    previous_value NUMERIC(15,2),
    new_value NUMERIC(15,2),
    previous_progress NUMERIC(5,2),
    new_progress NUMERIC(5,2),
    previous_confidence INTEGER,
    new_confidence INTEGER,
    comment TEXT,
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_okr_updates_tenant ON task_okr_updates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_okr_updates_entity ON task_okr_updates(entity_id, entity_type);

-- Enable RLS
ALTER TABLE task_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_key_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_okr_updates ENABLE ROW LEVEL SECURITY;

-- Create Policies (Standard Tenant Isolation)
-- Objectives
CREATE POLICY tenant_isolation_task_objectives ON task_objectives FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));
-- Key Results
CREATE POLICY tenant_isolation_task_key_results ON task_key_results FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));
-- Updates
CREATE POLICY tenant_isolation_task_okr_updates ON task_okr_updates FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));

COMMIT;
