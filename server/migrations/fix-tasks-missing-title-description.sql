-- Migration: Add title and description to tasks when missing (production fix)
-- Run when tasks table exists but has legacy schema (e.g. text, completed, priority)
-- Required for POST /api/tasks which inserts title, description, type, category, etc.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tasks') THEN
        RAISE NOTICE 'tasks table does not exist, skipping';
        RETURN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'title') THEN
        ALTER TABLE tasks ADD COLUMN title TEXT NOT NULL DEFAULT '';
        RAISE NOTICE 'Column title added to tasks table';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'description') THEN
        ALTER TABLE tasks ADD COLUMN description TEXT;
        RAISE NOTICE 'Column description added to tasks table';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'type') THEN
        ALTER TABLE tasks ADD COLUMN type TEXT NOT NULL DEFAULT 'Personal';
        RAISE NOTICE 'Column type added to tasks table';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'category') THEN
        ALTER TABLE tasks ADD COLUMN category TEXT NOT NULL DEFAULT 'General';
        RAISE NOTICE 'Column category added to tasks table';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'status') THEN
        ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'Not Started';
        RAISE NOTICE 'Column status added to tasks table';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'start_date') THEN
        ALTER TABLE tasks ADD COLUMN start_date DATE NOT NULL DEFAULT CURRENT_DATE;
        RAISE NOTICE 'Column start_date added to tasks table';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'hard_deadline') THEN
        ALTER TABLE tasks ADD COLUMN hard_deadline DATE NOT NULL DEFAULT CURRENT_DATE;
        RAISE NOTICE 'Column hard_deadline added to tasks table';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'created_by_id') THEN
        ALTER TABLE tasks ADD COLUMN created_by_id TEXT;
        RAISE NOTICE 'Column created_by_id added to tasks table';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'created_at') THEN
        ALTER TABLE tasks ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT NOW();
        RAISE NOTICE 'Column created_at added to tasks table';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'updated_at') THEN
        ALTER TABLE tasks ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT NOW();
        RAISE NOTICE 'Column updated_at added to tasks table';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'assigned_by_id') THEN
        ALTER TABLE tasks ADD COLUMN assigned_by_id TEXT;
        RAISE NOTICE 'Column assigned_by_id added to tasks table';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'assigned_to_id') THEN
        ALTER TABLE tasks ADD COLUMN assigned_to_id TEXT;
        RAISE NOTICE 'Column assigned_to_id added to tasks table';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'kpi_goal') THEN
        ALTER TABLE tasks ADD COLUMN kpi_goal TEXT;
        RAISE NOTICE 'Column kpi_goal added to tasks table';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'kpi_target_value') THEN
        ALTER TABLE tasks ADD COLUMN kpi_target_value REAL;
        RAISE NOTICE 'Column kpi_target_value added to tasks table';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'kpi_current_value') THEN
        ALTER TABLE tasks ADD COLUMN kpi_current_value REAL DEFAULT 0;
        RAISE NOTICE 'Column kpi_current_value added to tasks table';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'kpi_unit') THEN
        ALTER TABLE tasks ADD COLUMN kpi_unit TEXT;
        RAISE NOTICE 'Column kpi_unit added to tasks table';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'kpi_progress_percentage') THEN
        ALTER TABLE tasks ADD COLUMN kpi_progress_percentage REAL DEFAULT 0;
        RAISE NOTICE 'Column kpi_progress_percentage added to tasks table';
    END IF;
END $$;
