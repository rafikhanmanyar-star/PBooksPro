-- Migration: Add new payslips columns when missing (legacy payslips table)
-- Use when production has OLD payslips (payroll_cycle_id, user_id, etc.) and staging has NEW (payroll_run_id, basic_pay, etc.)
-- Additive only. Idempotent. Safe to re-run.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payslips') THEN
        RAISE NOTICE 'payslips table does not exist, skipping';
        RETURN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payslips' AND column_name = 'payroll_run_id') THEN
        ALTER TABLE payslips ADD COLUMN payroll_run_id TEXT DEFAULT '' NOT NULL;
        RAISE NOTICE 'Column payroll_run_id added to payslips';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payslips' AND column_name = 'basic_pay') THEN
        ALTER TABLE payslips ADD COLUMN basic_pay NUMERIC DEFAULT 0 NOT NULL;
        RAISE NOTICE 'Column basic_pay added to payslips';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payslips' AND column_name = 'total_adjustments') THEN
        ALTER TABLE payslips ADD COLUMN total_adjustments NUMERIC DEFAULT 0 NOT NULL;
        RAISE NOTICE 'Column total_adjustments added to payslips';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payslips' AND column_name = 'gross_pay') THEN
        ALTER TABLE payslips ADD COLUMN gross_pay NUMERIC DEFAULT 0 NOT NULL;
        RAISE NOTICE 'Column gross_pay added to payslips';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payslips' AND column_name = 'net_pay') THEN
        ALTER TABLE payslips ADD COLUMN net_pay NUMERIC DEFAULT 0 NOT NULL;
        RAISE NOTICE 'Column net_pay added to payslips';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payslips' AND column_name = 'allowance_details') THEN
        ALTER TABLE payslips ADD COLUMN allowance_details JSONB DEFAULT '[]'::jsonb;
        RAISE NOTICE 'Column allowance_details added to payslips';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payslips' AND column_name = 'deduction_details') THEN
        ALTER TABLE payslips ADD COLUMN deduction_details JSONB DEFAULT '[]'::jsonb;
        RAISE NOTICE 'Column deduction_details added to payslips';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payslips' AND column_name = 'adjustment_details') THEN
        ALTER TABLE payslips ADD COLUMN adjustment_details JSONB DEFAULT '[]'::jsonb;
        RAISE NOTICE 'Column adjustment_details added to payslips';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payslips' AND column_name = 'is_paid') THEN
        ALTER TABLE payslips ADD COLUMN is_paid BOOLEAN DEFAULT false;
        RAISE NOTICE 'Column is_paid added to payslips';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payslips' AND column_name = 'paid_at') THEN
        ALTER TABLE payslips ADD COLUMN paid_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Column paid_at added to payslips';
    END IF;
END $$;
