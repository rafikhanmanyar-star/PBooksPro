-- Migration: Task Workflow Module
-- Purpose: Schema for Task Workflow, SLA, Approvals, and Status Transitions

BEGIN;

-- ==========================================
-- 1. Task Workflow Definitions (Optional Configuration)
-- ==========================================
-- In a more complex system, we might define custom workflows per tenant. 
-- For now, we enforce a standard workflow but allow for SLA configuration.

-- ==========================================
-- 2. Task Approvals
-- ==========================================
CREATE TABLE IF NOT EXISTS task_approvals (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
    requester_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    approver_id TEXT REFERENCES users(id) ON DELETE SET NULL, -- Specific user if assigned
    approver_role TEXT, -- Or role-based (e.g., 'Manager')
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMP,
    comments TEXT
);

CREATE INDEX IF NOT EXISTS idx_task_approvals_task ON task_approvals(task_id);
CREATE INDEX IF NOT EXISTS idx_task_approvals_approver ON task_approvals(approver_id);

-- ==========================================
-- 3. Task SLA & Escalation
-- ==========================================
-- We can add SLA columns directly to the task_items table or a separate table if 1:1
ALTER TABLE task_items ADD COLUMN IF NOT EXISTS sla_policy TEXT DEFAULT 'Standard'; -- 'Standard', 'Urgent', 'Critical'
ALTER TABLE task_items ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMP;
ALTER TABLE task_items ADD COLUMN IF NOT EXISTS sla_breach_at TIMESTAMP; 
ALTER TABLE task_items ADD COLUMN IF NOT EXISTS escalation_level INTEGER DEFAULT 0; -- 0=None, 1=Manager, 2=Director
ALTER TABLE task_items ADD COLUMN IF NOT EXISTS is_escalated BOOLEAN DEFAULT FALSE;

-- ==========================================
-- 4. Status Transition History (Workflow Log)
-- ==========================================
CREATE TABLE IF NOT EXISTS task_status_history (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
    previous_status TEXT,
    new_status TEXT NOT NULL,
    changed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    change_reason TEXT,
    changed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_status_history_task ON task_status_history(task_id);

-- Enable RLS
ALTER TABLE task_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_status_history ENABLE ROW LEVEL SECURITY;

-- Create Policies (Standard Tenant Isolation)
-- Approvals
CREATE POLICY tenant_isolation_task_approvals ON task_approvals FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Status History
CREATE POLICY tenant_isolation_task_status_history ON task_status_history FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));

COMMIT;
