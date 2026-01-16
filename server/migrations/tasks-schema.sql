-- Task Management System Schema
-- PostgreSQL schema for tasks, task updates, performance scores, and performance config

-- ============================================================================
-- TASKS
-- ============================================================================

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL CHECK (type IN ('Personal', 'Assigned')),
    category TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Not Started', 'In Progress', 'Review', 'Completed')),
    start_date DATE NOT NULL,
    hard_deadline DATE NOT NULL,
    kpi_goal TEXT,
    kpi_target_value REAL,
    kpi_current_value REAL DEFAULT 0,
    kpi_unit TEXT,
    kpi_progress_percentage REAL DEFAULT 0 CHECK (kpi_progress_percentage >= 0 AND kpi_progress_percentage <= 100),
    assigned_by_id TEXT,
    assigned_to_id TEXT,
    created_by_id TEXT NOT NULL,
    user_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT valid_deadline CHECK (hard_deadline >= start_date)
);

-- Task updates/comment history table
CREATE TABLE IF NOT EXISTS task_updates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    update_type TEXT NOT NULL CHECK (update_type IN ('Status Change', 'KPI Update', 'Comment', 'Check-in')),
    status_before TEXT,
    status_after TEXT,
    kpi_value_before REAL,
    kpi_value_after REAL,
    comment TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- Task performance scores table (for leaderboard)
CREATE TABLE IF NOT EXISTS task_performance_scores (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_tasks INTEGER DEFAULT 0,
    completed_tasks INTEGER DEFAULT 0,
    on_time_completions INTEGER DEFAULT 0,
    overdue_tasks INTEGER DEFAULT 0,
    average_kpi_achievement REAL DEFAULT 0,
    completion_rate REAL DEFAULT 0 CHECK (completion_rate >= 0 AND completion_rate <= 100),
    deadline_adherence_rate REAL DEFAULT 0 CHECK (deadline_adherence_rate >= 0 AND deadline_adherence_rate <= 100),
    performance_score REAL DEFAULT 0,
    calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(tenant_id, user_id, period_start, period_end)
);

-- Task performance configuration (Admin-configurable weights)
CREATE TABLE IF NOT EXISTS task_performance_config (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL UNIQUE,
    completion_rate_weight REAL DEFAULT 0.33 CHECK (completion_rate_weight >= 0 AND completion_rate_weight <= 1),
    deadline_adherence_weight REAL DEFAULT 0.33 CHECK (deadline_adherence_weight >= 0 AND deadline_adherence_weight <= 1),
    kpi_achievement_weight REAL DEFAULT 0.34 CHECK (kpi_achievement_weight >= 0 AND kpi_achievement_weight <= 1),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT weights_sum_to_one CHECK (
        ABS((completion_rate_weight + deadline_adherence_weight + kpi_achievement_weight) - 1.0) < 0.01
    )
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_id ON tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_id ON tasks(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by_id ON tasks(created_by_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_hard_deadline ON tasks(hard_deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_status ON tasks(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_deadline ON tasks(tenant_id, hard_deadline);

CREATE INDEX IF NOT EXISTS idx_task_updates_task_id ON task_updates(task_id);
CREATE INDEX IF NOT EXISTS idx_task_updates_tenant_id ON task_updates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_updates_user_id ON task_updates(user_id);
CREATE INDEX IF NOT EXISTS idx_task_updates_created_at ON task_updates(created_at);

CREATE INDEX IF NOT EXISTS idx_task_performance_scores_tenant_id ON task_performance_scores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_performance_scores_user_id ON task_performance_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_task_performance_scores_period ON task_performance_scores(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_task_performance_scores_tenant_period ON task_performance_scores(tenant_id, period_start, period_end);

-- Row Level Security Policies
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_performance_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_performance_config ENABLE ROW LEVEL SECURITY;

-- Tasks policies
DROP POLICY IF EXISTS tenant_isolation_tasks ON tasks;
CREATE POLICY tenant_isolation_tasks ON tasks
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Task updates policies
DROP POLICY IF EXISTS tenant_isolation_task_updates ON task_updates;
CREATE POLICY tenant_isolation_task_updates ON task_updates
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Task performance scores policies
DROP POLICY IF EXISTS tenant_isolation_task_performance_scores ON task_performance_scores;
CREATE POLICY tenant_isolation_task_performance_scores ON task_performance_scores
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Task performance config policies
DROP POLICY IF EXISTS tenant_isolation_task_performance_config ON task_performance_config;
CREATE POLICY tenant_isolation_task_performance_config ON task_performance_config
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());
