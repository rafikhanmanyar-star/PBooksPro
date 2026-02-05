-- Migration: Fix Transactions Schema
-- Add missing columns to transactions table to match the application code
-- Date: 2026-02-05

-- subtype: for Loan and Journal transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS subtype TEXT;

-- from_account_id and to_account_id: for Transfer transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS from_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS to_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL;

-- vendor_id: already added by separate-vendors.sql, but ensuring it exists
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL;

-- building_id, property_id, unit_id: for Real Estate linked transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS building_id TEXT REFERENCES buildings(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS property_id TEXT REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS unit_id TEXT REFERENCES units(id) ON DELETE SET NULL;

-- payslip_id: for Payroll linked transactions (CRITICAL FIX)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payslip_id TEXT REFERENCES payslips(id) ON DELETE SET NULL;

-- contract_id: for Project Contracts linked transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL;

-- agreement_id: for Rental/Project Agreements linked transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS agreement_id TEXT;

-- batch_id: for Journal batches
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS batch_id TEXT;

-- is_system: flag for system-generated transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE;

-- updated_at: timestamp for tracking modifications
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add indices for new FK columns
CREATE INDEX IF NOT EXISTS idx_transactions_payslip_id ON transactions(payslip_id);
CREATE INDEX IF NOT EXISTS idx_transactions_batch_id ON transactions(batch_id);
CREATE INDEX IF NOT EXISTS idx_transactions_vendor_id ON transactions(vendor_id);
CREATE INDEX IF NOT EXISTS idx_transactions_contract_id ON transactions(contract_id);
