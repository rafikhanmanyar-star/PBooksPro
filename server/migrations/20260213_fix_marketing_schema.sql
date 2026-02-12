-- Migration: Fix Marketing Schema (Installment Plans & Plan Amenities)
-- Date: 2026-02-13
-- Description: Ensures installment_plans has all necessary columns and plan_amenities table exists with RLS

BEGIN;

-- 1. Ensure plan_amenities table exists
CREATE TABLE IF NOT EXISTS plan_amenities (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price DECIMAL(15, 2) NOT NULL DEFAULT 0,
    is_percentage BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. Add missing columns to installment_plans
DO $$ 
BEGIN
    -- Core marketing columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='duration_years') THEN
        ALTER TABLE installment_plans ADD COLUMN duration_years INTEGER;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='down_payment_percentage') THEN
        ALTER TABLE installment_plans ADD COLUMN down_payment_percentage DECIMAL(15, 2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='frequency') THEN
        ALTER TABLE installment_plans ADD COLUMN frequency TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='list_price') THEN
        ALTER TABLE installment_plans ADD COLUMN list_price DECIMAL(15, 2) DEFAULT 0;
    END IF;

    -- Discount columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='customer_discount') THEN
        ALTER TABLE installment_plans ADD COLUMN customer_discount DECIMAL(15, 2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='floor_discount') THEN
        ALTER TABLE installment_plans ADD COLUMN floor_discount DECIMAL(15, 2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='lump_sum_discount') THEN
        ALTER TABLE installment_plans ADD COLUMN lump_sum_discount DECIMAL(15, 2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='misc_discount') THEN
        ALTER TABLE installment_plans ADD COLUMN misc_discount DECIMAL(15, 2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='down_payment_amount') THEN
        ALTER TABLE installment_plans ADD COLUMN down_payment_amount DECIMAL(15, 2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='installment_amount') THEN
        ALTER TABLE installment_plans ADD COLUMN installment_amount DECIMAL(15, 2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='total_installments') THEN
        ALTER TABLE installment_plans ADD COLUMN total_installments INTEGER;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='description') THEN
        ALTER TABLE installment_plans ADD COLUMN description TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='user_id') THEN
        ALTER TABLE installment_plans ADD COLUMN user_id TEXT;
    END IF;

    -- Versioning & Status
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='intro_text') THEN
        ALTER TABLE installment_plans ADD COLUMN intro_text TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='version') THEN
        ALTER TABLE installment_plans ADD COLUMN version INTEGER DEFAULT 1;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='root_id') THEN
        ALTER TABLE installment_plans ADD COLUMN root_id TEXT;
    END IF;

    -- Approval columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='approval_requested_by') THEN
        ALTER TABLE installment_plans ADD COLUMN approval_requested_by TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='approval_requested_to') THEN
        ALTER TABLE installment_plans ADD COLUMN approval_requested_to TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='approval_requested_at') THEN
        ALTER TABLE installment_plans ADD COLUMN approval_requested_at TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='approval_reviewed_by') THEN
        ALTER TABLE installment_plans ADD COLUMN approval_reviewed_by TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='approval_reviewed_at') THEN
        ALTER TABLE installment_plans ADD COLUMN approval_reviewed_at TEXT;
    END IF;

    -- JSONB & Category IDs
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='discounts') THEN
        ALTER TABLE installment_plans ADD COLUMN discounts JSONB DEFAULT '[]'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='customer_discount_category_id') THEN
        ALTER TABLE installment_plans ADD COLUMN customer_discount_category_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='floor_discount_category_id') THEN
        ALTER TABLE installment_plans ADD COLUMN floor_discount_category_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='lump_sum_discount_category_id') THEN
        ALTER TABLE installment_plans ADD COLUMN lump_sum_discount_category_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='misc_discount_category_id') THEN
        ALTER TABLE installment_plans ADD COLUMN misc_discount_category_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='selected_amenities') THEN
        ALTER TABLE installment_plans ADD COLUMN selected_amenities JSONB DEFAULT '[]'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='amenities_total') THEN
        ALTER TABLE installment_plans ADD COLUMN amenities_total DECIMAL(15, 2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='installment_plans' AND column_name='updated_at') THEN
        ALTER TABLE installment_plans ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
    END IF;

END $$;

-- 3. Enable RLS and create policies
ALTER TABLE plan_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE installment_plans ENABLE ROW LEVEL SECURITY;

-- plan_amenities policy
DROP POLICY IF EXISTS tenant_isolation ON plan_amenities;
CREATE POLICY tenant_isolation ON plan_amenities
    FOR ALL 
    USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)))
    WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)));

-- installment_plans policy
DROP POLICY IF EXISTS tenant_isolation ON installment_plans;
CREATE POLICY tenant_isolation ON installment_plans
    FOR ALL 
    USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)))
    WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)));

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS idx_plan_amenities_tenant ON plan_amenities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_installment_plans_tenant ON installment_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_installment_plans_project ON installment_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_installment_plans_unit ON installment_plans(unit_id);
CREATE INDEX IF NOT EXISTS idx_installment_plans_lead ON installment_plans(lead_id);

COMMIT;
