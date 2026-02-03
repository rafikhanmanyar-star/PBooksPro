-- Migration: Task Assignment Module
-- Purpose: Schema for Task Assignments, History, and Contributors

BEGIN;

-- ==========================================
-- 1. Task Contributors (Many-to-Many)
-- ==========================================
-- Used for secondary assignees/contributors beyond the primary owner
CREATE TABLE IF NOT EXISTS task_contributors (
    task_id TEXT NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'Contributor', -- 'Contributor', 'Reviewer', 'Watcher'
    assigned_at TIMESTAMP DEFAULT NOW(),
    assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (task_id, user_id)
);

-- ==========================================
-- 2. Task Assignment History (Audit Log)
-- ==========================================
CREATE TABLE IF NOT EXISTS task_assignment_history (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
    previous_owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    new_owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    changed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    change_reason TEXT,
    changed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_assignment_history_task ON task_assignment_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignment_history_tenant ON task_assignment_history(tenant_id);

-- Enable RLS
ALTER TABLE task_contributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignment_history ENABLE ROW LEVEL SECURITY;

-- Create Policies (Standard Tenant Isolation)
-- Contributors
CREATE POLICY tenant_isolation_task_contributors ON task_contributors FOR ALL USING (
    task_id IN (SELECT id FROM task_items WHERE tenant_id = current_setting('app.current_tenant_id', true))
);

-- Assignment History
CREATE POLICY tenant_isolation_task_assignment_history ON task_assignment_history FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));

COMMIT;
