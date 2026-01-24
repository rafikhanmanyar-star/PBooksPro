# Run Migration Safely - Step by Step

If the full migration isn't working, let's run it step by step to identify issues.

## Method 1: Run Full Schema (Try Again)

### Before Running:

1. **Clear any errors** - Check DBeaver output panel
2. **Make sure you're in the right database** - Should be `pbookspro`
3. **Open a fresh SQL script** - File → New → SQL Script

### Steps:

1. **Copy the entire `postgresql-schema.sql`** file
2. **Paste into DBeaver SQL Editor**
3. **Execute** (F5 or play button)
4. **Watch the output panel** for errors
5. **After execution, refresh Tables view** (right-click → Refresh)

### Check Results:

```sql
-- Should return 19 tables
SELECT COUNT(*) as table_count 
FROM information_schema.tables 
WHERE table_schema = 'public';

-- List all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;
```

## Method 2: Run in Smaller Chunks (If Full Fails)

If the full migration fails, run these sections one at a time:

### Chunk 1: Extension Only

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

**Check:** Should complete without error.

### Chunk 2: Core Tables (Tenants, Admin)

```sql
-- Tenants
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
    max_users INTEGER DEFAULT 20,
    max_projects INTEGER DEFAULT 10,
    subscription_tier TEXT DEFAULT 'free',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    settings JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT valid_license_type CHECK (license_type IN ('trial', 'monthly', 'yearly', 'perpetual')),
    CONSTRAINT valid_license_status CHECK (license_status IN ('active', 'expired', 'suspended', 'cancelled'))
);

-- Admin Users
CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_role CHECK (role IN ('super_admin', 'admin'))
);
```

**Check:** Run `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';` - should see `tenants` and `admin_users`.

### Chunk 3: Continue with Rest

If Chunk 2 works, continue with the rest of the schema.

## Method 3: Use CREATE_ADMIN_USERS_TABLE.sql (Quick Fix)

If you just need admin login working now:

1. Run `CREATE_ADMIN_USERS_TABLE.sql` (already created)
2. This creates just `admin_users` table
3. You can run full schema later

## Important: Check Output Panel

After running migration:

1. **Look at bottom panel** in DBeaver (Output/Log)
2. **Scroll to find ERROR messages**
3. **The first ERROR** is where it stopped
4. **Share that error** so we can fix it

## Refresh Tables View

After running SQL:

1. **Right-click** "Tables" in left sidebar
2. Click **"Refresh"** or press **F5**
3. Tables should appear

---

**Try running the full migration again, but this time:**
1. Watch the output panel for errors
2. Note the first ERROR message
3. Refresh the Tables view after execution
4. Share any ERROR messages you see

