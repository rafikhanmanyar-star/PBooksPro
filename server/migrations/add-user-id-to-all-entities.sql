-- Migration: Add user_id column to all entity tables
-- This migration adds the user_id column to track which user created/updated each entity
-- for audit logging and tracking user activities in the transactions log section

-- Add user_id to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS user_id TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'projects_user_id_fkey'
    ) THEN
        ALTER TABLE projects 
        ADD CONSTRAINT projects_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

-- Add user_id to buildings table
ALTER TABLE buildings 
ADD COLUMN IF NOT EXISTS user_id TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'buildings_user_id_fkey'
    ) THEN
        ALTER TABLE buildings 
        ADD CONSTRAINT buildings_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_buildings_user_id ON buildings(user_id);

-- Add user_id to properties table
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS user_id TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'properties_user_id_fkey'
    ) THEN
        ALTER TABLE properties 
        ADD CONSTRAINT properties_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_properties_user_id ON properties(user_id);

-- Add user_id to units table
ALTER TABLE units 
ADD COLUMN IF NOT EXISTS user_id TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'units_user_id_fkey'
    ) THEN
        ALTER TABLE units 
        ADD CONSTRAINT units_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_units_user_id ON units(user_id);

-- Add user_id to invoices table
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS user_id TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'invoices_user_id_fkey'
    ) THEN
        ALTER TABLE invoices 
        ADD CONSTRAINT invoices_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);

-- Add user_id to bills table
ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS user_id TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'bills_user_id_fkey'
    ) THEN
        ALTER TABLE bills 
        ADD CONSTRAINT bills_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bills_user_id ON bills(user_id);

-- Add user_id to budgets table
ALTER TABLE budgets 
ADD COLUMN IF NOT EXISTS user_id TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'budgets_user_id_fkey'
    ) THEN
        ALTER TABLE budgets 
        ADD CONSTRAINT budgets_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);

-- Add user_id to rental_agreements table
ALTER TABLE rental_agreements 
ADD COLUMN IF NOT EXISTS user_id TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'rental_agreements_user_id_fkey'
    ) THEN
        ALTER TABLE rental_agreements 
        ADD CONSTRAINT rental_agreements_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rental_agreements_user_id ON rental_agreements(user_id);

-- Add user_id to project_agreements table
ALTER TABLE project_agreements 
ADD COLUMN IF NOT EXISTS user_id TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'project_agreements_user_id_fkey'
    ) THEN
        ALTER TABLE project_agreements 
        ADD CONSTRAINT project_agreements_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_agreements_user_id ON project_agreements(user_id);

-- Add user_id to contacts table
ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS user_id TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'contacts_user_id_fkey'
    ) THEN
        ALTER TABLE contacts 
        ADD CONSTRAINT contacts_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);

-- Add user_id to accounts table
ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS user_id TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'accounts_user_id_fkey'
    ) THEN
        ALTER TABLE accounts 
        ADD CONSTRAINT accounts_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

-- Add user_id to categories table
ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS user_id TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'categories_user_id_fkey'
    ) THEN
        ALTER TABLE categories 
        ADD CONSTRAINT categories_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);

-- Note: Existing records will have user_id = NULL
-- The user_id will be populated for new records created after this migration

