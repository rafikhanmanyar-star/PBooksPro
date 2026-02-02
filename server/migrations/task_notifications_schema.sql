-- Migration: Task Notifications Module
-- Purpose: Schema for Notifications, User Preferences, and Alert Configs

BEGIN;

-- ==========================================
-- 1. Notifications Table
-- ==========================================
CREATE TABLE IF NOT EXISTS task_notifications (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'Task', 'Initiative', 'KPI', 'Approval', 'System', 'SLA'
    title TEXT NOT NULL,
    message TEXT,
    reference_id TEXT, -- ID of the related object (Task ID, OKR ID, etc.)
    reference_type TEXT, -- Table name or type identifier
    is_read BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    read_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_task_notifications_user ON task_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_task_notifications_unread ON task_notifications(user_id) WHERE is_read = FALSE;

-- ==========================================
-- 2. Notification Preferences
-- ==========================================
CREATE TABLE IF NOT EXISTS task_notification_preferences (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email_enabled BOOLEAN DEFAULT TRUE,
    in_app_enabled BOOLEAN DEFAULT TRUE,
    push_enabled BOOLEAN DEFAULT FALSE,
    notify_on_assignment BOOLEAN DEFAULT TRUE,
    notify_on_status_change BOOLEAN DEFAULT TRUE,
    notify_on_comments BOOLEAN DEFAULT TRUE,
    notify_on_approval BOOLEAN DEFAULT TRUE,
    notify_on_deadline BOOLEAN DEFAULT TRUE,
    sla_alert_threshold_hours INTEGER DEFAULT 24, -- Configurable SLA warning time
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 3. Scheduled Reminders (Optional / Future Use)
-- ==========================================
-- Can be used by a background worker to send recurring reminders
CREATE TABLE IF NOT EXISTS task_reminders (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    due_at TIMESTAMP NOT NULL,
    reference_id TEXT,
    is_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE task_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_reminders ENABLE ROW LEVEL SECURITY;

-- Create Policies (Standard Tenant Isolation)
-- Notifications
CREATE POLICY tenant_isolation_task_notifications ON task_notifications FOR ALL USING (
    tenant_id = current_setting('app.current_tenant_id', true) AND 
    user_id = current_setting('app.current_user_id', true) -- Only see own notifications
);

-- Preferences
CREATE POLICY tenant_isolation_task_preferences ON task_notification_preferences FOR ALL USING (
    tenant_id = current_setting('app.current_tenant_id', true) AND 
    user_id = current_setting('app.current_user_id', true)
);

-- Reminders
CREATE POLICY tenant_isolation_task_reminders ON task_reminders FOR ALL USING (
    tenant_id = current_setting('app.current_tenant_id', true) AND
    user_id = current_setting('app.current_user_id', true)
);

COMMIT;
