-- Quick Fix: Add missing columns to tasks table
-- Run this if you're getting "column assigned_to_id does not exist" error

-- Add assigned_to_id column if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'assigned_to_id') THEN
        ALTER TABLE tasks ADD COLUMN assigned_to_id TEXT;
        ALTER TABLE tasks ADD CONSTRAINT tasks_assigned_to_id_fkey FOREIGN KEY (assigned_to_id) REFERENCES users(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_id ON tasks(assigned_to_id);
        RAISE NOTICE 'Added assigned_to_id column to tasks table';
    ELSE
        RAISE NOTICE 'assigned_to_id column already exists';
    END IF;
END $$;

-- Add assigned_by_id column if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'assigned_by_id') THEN
        ALTER TABLE tasks ADD COLUMN assigned_by_id TEXT;
        ALTER TABLE tasks ADD CONSTRAINT tasks_assigned_by_id_fkey FOREIGN KEY (assigned_by_id) REFERENCES users(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_tasks_assigned_by_id ON tasks(assigned_by_id);
        RAISE NOTICE 'Added assigned_by_id column to tasks table';
    ELSE
        RAISE NOTICE 'assigned_by_id column already exists';
    END IF;
END $$;

-- Add other missing columns
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'kpi_progress_percentage') THEN
        ALTER TABLE tasks ADD COLUMN kpi_progress_percentage REAL DEFAULT 0;
        ALTER TABLE tasks ADD CONSTRAINT tasks_kpi_progress_check CHECK (kpi_progress_percentage >= 0 AND kpi_progress_percentage <= 100);
        RAISE NOTICE 'Added kpi_progress_percentage column';
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'kpi_current_value') THEN
        ALTER TABLE tasks ADD COLUMN kpi_current_value REAL DEFAULT 0;
        RAISE NOTICE 'Added kpi_current_value column';
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'kpi_target_value') THEN
        ALTER TABLE tasks ADD COLUMN kpi_target_value REAL;
        RAISE NOTICE 'Added kpi_target_value column';
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'kpi_unit') THEN
        ALTER TABLE tasks ADD COLUMN kpi_unit TEXT;
        RAISE NOTICE 'Added kpi_unit column';
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'kpi_goal') THEN
        ALTER TABLE tasks ADD COLUMN kpi_goal TEXT;
        RAISE NOTICE 'Added kpi_goal column';
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'hard_deadline') THEN
        ALTER TABLE tasks ADD COLUMN hard_deadline DATE;
        RAISE NOTICE 'Added hard_deadline column';
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'start_date') THEN
        ALTER TABLE tasks ADD COLUMN start_date DATE;
        RAISE NOTICE 'Added start_date column';
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'category') THEN
        ALTER TABLE tasks ADD COLUMN category TEXT;
        RAISE NOTICE 'Added category column';
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'type') THEN
        ALTER TABLE tasks ADD COLUMN type TEXT;
        RAISE NOTICE 'Added type column';
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'created_by_id') THEN
        ALTER TABLE tasks ADD COLUMN created_by_id TEXT;
        ALTER TABLE tasks ADD CONSTRAINT tasks_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE RESTRICT;
        CREATE INDEX IF NOT EXISTS idx_tasks_created_by_id ON tasks(created_by_id);
        RAISE NOTICE 'Added created_by_id column';
    END IF;
END $$;
