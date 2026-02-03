-- Migration: Task Execution & Collaboration Module
-- Purpose: Schema for Task Updates, File Handling, and Activity Logging

BEGIN;

-- ==========================================
-- 1. Task Progress Updates (Execution Logs)
-- ==========================================
CREATE TABLE IF NOT EXISTS task_progress_updates (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    previous_progress NUMERIC(5,2),
    new_progress NUMERIC(5,2) CHECK (new_progress >= 0 AND new_progress <= 100),
    comment TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_progress_updates_task ON task_progress_updates(task_id);

-- ==========================================
-- 2. Task Comments (Enhanced)
-- ==========================================
-- Note: 'task_comments' table likely exists from Module 5 schema. 
-- If not, created here. If yes, we ensure it supports threads/mentions structure.
-- We'll assume the basic table exists and add threading support if missing.

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_comments' AND column_name = 'parent_comment_id') THEN
        ALTER TABLE task_comments ADD COLUMN parent_comment_id TEXT REFERENCES task_comments(id) ON DELETE CASCADE; 
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_comments' AND column_name = 'mentions') THEN
        ALTER TABLE task_comments ADD COLUMN mentions TEXT[]; -- Array of user IDs mentioned
    END IF;
END $$;


-- ==========================================
-- 3. Activity Timeline (Consolidated View)
-- ==========================================
-- This table aggregates various events (Status Changes, Assignments, Comments, Files) 
-- into a single queryable timeline for UI "Activity Logs". 
-- In a real system, this might be a View or a trigger-fed table. 
-- For this simplified schema, we'll create a dedicated table for generic events not covered elsewhere 
-- or rely on UNION queries over specific history tables. 

-- Let's create a generic event table for things NOT covered by specific history tables (like file uploads)
CREATE TABLE IF NOT EXISTS task_activity_events (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL, -- 'File Uploaded', 'Subtask Completed', 'Description Updated'
    description TEXT,
    metadata JSONB DEFAULT '{}', -- Store file details, diffs, etc.
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_activity_events_task ON task_activity_events(task_id);

-- Enable RLS
ALTER TABLE task_progress_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_activity_events ENABLE ROW LEVEL SECURITY;

-- Create Policies (Standard Tenant Isolation)
-- Progress Updates
CREATE POLICY tenant_isolation_task_progress_updates ON task_progress_updates FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Activity Events
CREATE POLICY tenant_isolation_task_activity_events ON task_activity_events FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));

COMMIT;
