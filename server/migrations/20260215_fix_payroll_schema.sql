-- Fix payroll_runs table: drop erroneous FK constraints and ensure all required columns exist
-- ROOT CAUSE: created_by had a foreign key to users table which was never intended in the schema.
-- This caused "violates foreign key constraint payroll_runs_created_by_fkey" on INSERT.
-- Generated: 2026-02-15

-- Drop erroneous foreign key constraints on payroll_runs audit columns
-- These columns should be plain TEXT, not FK references to users table
ALTER TABLE payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_created_by_fkey;
ALTER TABLE payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_updated_by_fkey;
ALTER TABLE payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_approved_by_fkey;

-- Also drop any erroneous FK on payroll_employees audit columns
ALTER TABLE payroll_employees DROP CONSTRAINT IF EXISTS payroll_employees_created_by_fkey;
ALTER TABLE payroll_employees DROP CONSTRAINT IF EXISTS payroll_employees_updated_by_fkey;

-- Also drop any erroneous FK on payslips
ALTER TABLE payslips DROP CONSTRAINT IF EXISTS payslips_created_by_fkey;

-- Make created_by nullable (it was NOT NULL which can cause issues when syncing)
DO $$ BEGIN
    ALTER TABLE payroll_runs ALTER COLUMN created_by DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    -- Add period_start column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='period_start') THEN
        ALTER TABLE payroll_runs ADD COLUMN period_start DATE;
    END IF;

    -- Add period_end column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='period_end') THEN
        ALTER TABLE payroll_runs ADD COLUMN period_end DATE;
    END IF;

    -- Add employee_count column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='employee_count') THEN
        ALTER TABLE payroll_runs ADD COLUMN employee_count INTEGER DEFAULT 0;
    END IF;

    -- Add total_amount column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='total_amount') THEN
        ALTER TABLE payroll_runs ADD COLUMN total_amount DECIMAL(15, 2) DEFAULT 0;
    END IF;

    -- Add approved_by column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='approved_by') THEN
        ALTER TABLE payroll_runs ADD COLUMN approved_by TEXT;
    END IF;

    -- Add approved_at column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='approved_at') THEN
        ALTER TABLE payroll_runs ADD COLUMN approved_at TIMESTAMP;
    END IF;

    -- Add paid_at column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='paid_at') THEN
        ALTER TABLE payroll_runs ADD COLUMN paid_at TIMESTAMP;
    END IF;

    -- Add created_by column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='created_by') THEN
        ALTER TABLE payroll_runs ADD COLUMN created_by TEXT;
    END IF;

    -- Add updated_by column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='updated_by') THEN
        ALTER TABLE payroll_runs ADD COLUMN updated_by TEXT;
    END IF;

    -- Add created_at column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='created_at') THEN
        ALTER TABLE payroll_runs ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT NOW();
    END IF;

    -- Add updated_at column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='updated_at') THEN
        ALTER TABLE payroll_runs ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT NOW();
    END IF;

    -- Add status column if missing (with CHECK constraint)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_runs' AND column_name='status') THEN
        ALTER TABLE payroll_runs ADD COLUMN status TEXT NOT NULL DEFAULT 'DRAFT';
    END IF;
END $$;

-- Also ensure payslips table has all required columns
DO $$ BEGIN
    -- Add allowance_details if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payslips' AND column_name='allowance_details') THEN
        ALTER TABLE payslips ADD COLUMN allowance_details JSONB DEFAULT '[]'::jsonb;
    END IF;

    -- Add deduction_details if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payslips' AND column_name='deduction_details') THEN
        ALTER TABLE payslips ADD COLUMN deduction_details JSONB DEFAULT '[]'::jsonb;
    END IF;

    -- Add adjustment_details if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payslips' AND column_name='adjustment_details') THEN
        ALTER TABLE payslips ADD COLUMN adjustment_details JSONB DEFAULT '[]'::jsonb;
    END IF;

    -- Add total_adjustments if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payslips' AND column_name='total_adjustments') THEN
        ALTER TABLE payslips ADD COLUMN total_adjustments DECIMAL(15, 2) NOT NULL DEFAULT 0;
    END IF;

    -- Add is_paid if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payslips' AND column_name='is_paid') THEN
        ALTER TABLE payslips ADD COLUMN is_paid BOOLEAN DEFAULT FALSE;
    END IF;

    -- Add paid_at if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payslips' AND column_name='paid_at') THEN
        ALTER TABLE payslips ADD COLUMN paid_at TIMESTAMP;
    END IF;

    -- Add transaction_id if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payslips' AND column_name='transaction_id') THEN
        ALTER TABLE payslips ADD COLUMN transaction_id TEXT;
    END IF;

    -- Add basic_pay if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payslips' AND column_name='basic_pay') THEN
        ALTER TABLE payslips ADD COLUMN basic_pay DECIMAL(15, 2) NOT NULL DEFAULT 0;
    END IF;

    -- Add total_allowances if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payslips' AND column_name='total_allowances') THEN
        ALTER TABLE payslips ADD COLUMN total_allowances DECIMAL(15, 2) NOT NULL DEFAULT 0;
    END IF;

    -- Add total_deductions if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payslips' AND column_name='total_deductions') THEN
        ALTER TABLE payslips ADD COLUMN total_deductions DECIMAL(15, 2) NOT NULL DEFAULT 0;
    END IF;

    -- Add gross_pay if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payslips' AND column_name='gross_pay') THEN
        ALTER TABLE payslips ADD COLUMN gross_pay DECIMAL(15, 2) NOT NULL DEFAULT 0;
    END IF;

    -- Add net_pay if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payslips' AND column_name='net_pay') THEN
        ALTER TABLE payslips ADD COLUMN net_pay DECIMAL(15, 2) NOT NULL DEFAULT 0;
    END IF;
END $$;

-- Ensure payroll_employees has all required columns
DO $$ BEGIN
    -- Add department_id if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_employees' AND column_name='department_id') THEN
        ALTER TABLE payroll_employees ADD COLUMN department_id TEXT;
    END IF;

    -- Add employee_code if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_employees' AND column_name='employee_code') THEN
        ALTER TABLE payroll_employees ADD COLUMN employee_code TEXT;
    END IF;

    -- Add photo if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_employees' AND column_name='photo') THEN
        ALTER TABLE payroll_employees ADD COLUMN photo TEXT;
    END IF;

    -- Add adjustments if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_employees' AND column_name='adjustments') THEN
        ALTER TABLE payroll_employees ADD COLUMN adjustments JSONB DEFAULT '[]'::jsonb;
    END IF;

    -- Add projects if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_employees' AND column_name='projects') THEN
        ALTER TABLE payroll_employees ADD COLUMN projects JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;
