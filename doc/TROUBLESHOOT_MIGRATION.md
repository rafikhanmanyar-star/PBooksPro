# Troubleshoot Migration - No Tables Created

If you don't see any tables after running the migration, let's diagnose the issue.

## Step 1: Check for Errors

In DBeaver, after running the migration:

1. **Look at the "Output" or "Log" panel** at the bottom
2. **Scroll through all messages**
3. **Look for lines starting with `ERROR:`** (not NOTICE or WARNING)
4. **Note the first ERROR** - that's where it stopped

## Step 2: Check Current State

Run this to see what exists:

```sql
-- Check if ANY tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';

-- Check if extension exists
SELECT * FROM pg_extension WHERE extname = 'uuid-ossp';

-- Check current database
SELECT current_database();
```

## Step 3: Run Migration in Sections

If the full migration fails, run it in smaller chunks:

### Section 1: Extensions and Core Tables

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tenants table
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    company_name TEXT,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    address TEXT,
    subdomain TEXT UNIQUE,
    license_type TEXT NOT NULL DEFAULT 'trial',
    license_status TEXT NOT NULL DEFAULT 'active',
    license_key TEXT UNIQUE,
    trial_start_date TIMESTAMP,
    license_start_date TIMESTAMP,
    license_expiry_date TIMESTAMP,
    last_renewal_date TIMESTAMP,
    next_renewal_date TIMESTAMP,
    max_users INTEGER DEFAULT 5,
    max_projects INTEGER DEFAULT 10,
    subscription_tier TEXT DEFAULT 'free',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    settings JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT valid_license_type CHECK (license_type IN ('trial', 'monthly', 'yearly', 'perpetual')),
    CONSTRAINT valid_license_status CHECK (license_status IN ('active', 'expired', 'suspended', 'cancelled'))
);
```

Run this first, then check if `tenants` table was created.

## Step 4: Refresh DBeaver View

After running SQL:

1. **Right-click** on "Tables" folder in left sidebar
2. Select **"Refresh"** or press **F5**
3. Tables should appear

## Step 5: Check You're in Right Database

Make sure you're connected to the correct database:

1. Check connection name shows: `pbookspro`
2. Or run: `SELECT current_database();`
3. Should return: `pbookspro`

## Common Issues

### Issue 1: Migration Stopped at First Error

If there's an error early in the script, it might stop execution. Check the first ERROR message.

### Issue 2: Wrong Database

Make sure you're executing SQL in the `pbookspro` database, not a different one.

### Issue 3: Need to Refresh

DBeaver might not auto-refresh. Right-click "Tables" → "Refresh".

### Issue 4: Transaction Rollback

If there's an error, the transaction might roll back. Check for error messages.

---

**Before running again, please:**
1. Check the Output/Log panel for ERROR messages
2. Share the first ERROR you see
3. This will help identify what's blocking the migration

