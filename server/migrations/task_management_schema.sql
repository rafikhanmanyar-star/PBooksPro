-- Migration: Task Management Module
-- Purpose: Schema for Task Details, Dependencies, Subtasks, Activity Log

BEGIN;

-- ==========================================
-- 1. Tasks
-- ==========================================
CREATE TABLE IF NOT EXISTS task_items (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    initiative_id TEXT REFERENCES task_initiatives(id) ON DELETE SET NULL,
    objective_id TEXT REFERENCES task_objectives(id) ON DELETE SET NULL, -- Optional direct link to OKR
    parent_task_id TEXT REFERENCES task_items(id) ON DELETE SET NULL, -- For subtasks
    owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Not Started' CHECK (status IN ('Not Started', 'In Progress', 'Blocked', 'Completed', 'On Hold')),
    priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
    start_date DATE,
    due_date DATE NOT NULL,
    estimated_hours NUMERIC(6,2),
    actual_hours NUMERIC(6,2) DEFAULT 0,
    progress_percentage NUMERIC(5,2) DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_rule TEXT, -- iCal RRULE format or simplified string
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_task_items_tenant ON task_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_items_owner ON task_items(owner_id);
CREATE INDEX IF NOT EXISTS idx_task_items_initiative ON task_items(initiative_id);
CREATE INDEX IF NOT EXISTS idx_task_items_parent ON task_items(parent_task_id);

-- ==========================================
-- 2. Task Dependencies (Blocking Relationships)
-- ==========================================
CREATE TABLE IF NOT EXISTS task_dependencies (
    blocking_task_id TEXT NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
    dependent_task_id TEXT NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
    dependency_type TEXT DEFAULT 'Finish to Start', -- 'Finish to Start', 'Start to Start', etc.
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (blocking_task_id, dependent_task_id)
);

-- ==========================================
-- 3. Task Comments / Activity Log
-- ==========================================
CREATE TABLE IF NOT EXISTS task_comments (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'Comment', -- 'Comment', 'Status Change', 'Assignment Change'
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

-- ==========================================
-- 4. Task Attachments
-- ==========================================
CREATE TABLE IF NOT EXISTS task_attachments (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT,
    uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE task_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;

-- Create Policies (Standard Tenant Isolation)
-- Tasks
CREATE POLICY tenant_isolation_task_items ON task_items FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));
-- Dependencies
-- Note: Dependencies link tasks within the same tenant. Implicitly trusted if tasks are protected.
-- Comments
CREATE POLICY tenant_isolation_task_comments ON task_comments FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));
-- Attachments
CREATE POLICY tenant_isolation_task_attachments ON task_attachments FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));

COMMIT;
