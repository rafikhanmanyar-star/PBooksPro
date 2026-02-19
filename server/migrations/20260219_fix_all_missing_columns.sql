-- Migration: Add missing columns to ALL tables where the API route INSERT
-- references columns that don't exist in the database schema.
-- This caused INSERT failures when syncing data from local SQLite to cloud PostgreSQL.
-- Date: 2026-02-19

-- ========================================================================
-- 1. INVOICES - 11 missing columns
-- ========================================================================
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS project_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS building_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS property_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS unit_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS category_id TEXT REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS agreement_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS security_deposit_charge DECIMAL(15, 2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS service_charges DECIMAL(15, 2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS rental_month TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
UPDATE invoices SET updated_at = created_at WHERE updated_at IS NULL;

-- ========================================================================
-- 2. RENTAL_AGREEMENTS - 7 missing columns
-- ========================================================================
ALTER TABLE rental_agreements ADD COLUMN IF NOT EXISTS rent_due_date INTEGER;
ALTER TABLE rental_agreements ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE rental_agreements ADD COLUMN IF NOT EXISTS security_deposit DECIMAL(15, 2);
ALTER TABLE rental_agreements ADD COLUMN IF NOT EXISTS broker_id TEXT;
ALTER TABLE rental_agreements ADD COLUMN IF NOT EXISTS broker_fee DECIMAL(15, 2);
ALTER TABLE rental_agreements ADD COLUMN IF NOT EXISTS owner_id TEXT;
ALTER TABLE rental_agreements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
UPDATE rental_agreements SET updated_at = created_at WHERE updated_at IS NULL;

-- ========================================================================
-- 3. TRANSACTIONS - missing columns (some added by 01-fix-transactions-schema.sql)
-- ========================================================================
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS subtype TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS from_account_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS to_account_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS building_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS property_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS unit_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payslip_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS contract_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS agreement_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
UPDATE transactions SET updated_at = created_at WHERE updated_at IS NULL;

-- ========================================================================
-- 4. ACCOUNTS - 3 missing columns
-- ========================================================================
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
UPDATE accounts SET updated_at = created_at WHERE updated_at IS NULL;

-- ========================================================================
-- 5. PROJECTS - 6 missing columns
-- ========================================================================
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pm_config JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS installment_config JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
UPDATE projects SET updated_at = created_at WHERE updated_at IS NULL;

-- ========================================================================
-- 6. BUILDINGS - 3 missing columns
-- ========================================================================
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
UPDATE buildings SET updated_at = created_at WHERE updated_at IS NULL;

-- ========================================================================
-- 7. PROPERTIES - 3 missing columns
-- ========================================================================
ALTER TABLE properties ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS monthly_service_charge DECIMAL(15, 2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
UPDATE properties SET updated_at = created_at WHERE updated_at IS NULL;

-- ========================================================================
-- 8. UNITS - 7 missing columns
-- ========================================================================
ALTER TABLE units ADD COLUMN IF NOT EXISTS sale_price DECIMAL(15, 2);
ALTER TABLE units ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS area DECIMAL(15, 2);
ALTER TABLE units ADD COLUMN IF NOT EXISTS floor TEXT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
UPDATE units SET updated_at = created_at WHERE updated_at IS NULL;

-- ========================================================================
-- 9. CONTRACTS - 10 missing columns
-- ========================================================================
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS area DECIMAL(15, 2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS rate DECIMAL(15, 2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS category_ids TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS expense_category_items JSONB;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS document_path TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS document_id TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
UPDATE contracts SET updated_at = created_at WHERE updated_at IS NULL;

-- ========================================================================
-- 10. PROJECT_AGREEMENTS - 19 missing columns
-- ========================================================================
ALTER TABLE project_agreements ADD COLUMN IF NOT EXISTS unit_ids TEXT;
ALTER TABLE project_agreements ADD COLUMN IF NOT EXISTS list_price DECIMAL(15, 2);
ALTER TABLE project_agreements ADD COLUMN IF NOT EXISTS customer_discount DECIMAL(15, 2);
ALTER TABLE project_agreements ADD COLUMN IF NOT EXISTS floor_discount DECIMAL(15, 2);
ALTER TABLE project_agreements ADD COLUMN IF NOT EXISTS lump_sum_discount DECIMAL(15, 2);
ALTER TABLE project_agreements ADD COLUMN IF NOT EXISTS misc_discount DECIMAL(15, 2);
ALTER TABLE project_agreements ADD COLUMN IF NOT EXISTS rebate_amount DECIMAL(15, 2);
ALTER TABLE project_agreements ADD COLUMN IF NOT EXISTS rebate_broker_id TEXT;
ALTER TABLE project_agreements ADD COLUMN IF NOT EXISTS issue_date DATE;
ALTER TABLE project_agreements ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE project_agreements ADD COLUMN IF NOT EXISTS cancellation_details JSONB;
ALTER TABLE project_agreements ADD COLUMN IF NOT EXISTS list_price_category_id TEXT;
ALTER TABLE project_agreements ADD COLUMN IF NOT EXISTS customer_discount_category_id TEXT;
ALTER TABLE project_agreements ADD COLUMN IF NOT EXISTS floor_discount_category_id TEXT;
ALTER TABLE project_agreements ADD COLUMN IF NOT EXISTS lump_sum_discount_category_id TEXT;
ALTER TABLE project_agreements ADD COLUMN IF NOT EXISTS misc_discount_category_id TEXT;
ALTER TABLE project_agreements ADD COLUMN IF NOT EXISTS selling_price_category_id TEXT;
ALTER TABLE project_agreements ADD COLUMN IF NOT EXISTS rebate_category_id TEXT;
ALTER TABLE project_agreements ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE project_agreements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
UPDATE project_agreements SET updated_at = created_at WHERE updated_at IS NULL;

-- ========================================================================
-- INDEXES for commonly queried FK columns
-- ========================================================================
CREATE INDEX IF NOT EXISTS idx_invoices_agreement_id ON invoices(agreement_id);
CREATE INDEX IF NOT EXISTS idx_invoices_category_id ON invoices(category_id);
CREATE INDEX IF NOT EXISTS idx_invoices_project_id ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_transactions_building_id ON transactions(building_id);
CREATE INDEX IF NOT EXISTS idx_transactions_agreement_id ON transactions(agreement_id);
CREATE INDEX IF NOT EXISTS idx_contracts_document_id ON contracts(document_id);
CREATE INDEX IF NOT EXISTS idx_project_agreements_project_id ON project_agreements(project_id);
