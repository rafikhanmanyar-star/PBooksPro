# Fix Migration Errors

If you're getting errors when running the full schema, here's how to fix them:

## Share the Error

Please share:
1. **The exact error message** from DBeaver
2. **Which line/table** it failed on
3. **Any previous errors** you saw

This will help me provide a specific fix.

## Common Issues

### Issue 1: Tables Already Exist

**Error:** `relation "table_name" already exists`

**Fix:** The schema uses `CREATE TABLE IF NOT EXISTS`, so this shouldn't happen. But if it does:

```sql
-- Check what tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';

-- If you want to start fresh (WARNING: Deletes all data!)
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- Then re-run the full schema
```

### Issue 2: Policies Already Exist

**Error:** `policy "tenant_isolation_..." already exists`

**Fix:** The schema has `DROP POLICY IF EXISTS`, but if it still fails:

```sql
-- Drop all policies manually
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT schemaname, tablename, policyname 
              FROM pg_policies 
              WHERE schemaname = 'public') 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 
                       r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;

-- Then re-run the schema
```

### Issue 3: Foreign Key Violations

**Error:** Foreign key constraint errors

**Fix:** Tables should be created in order. If you see this:

1. Check which table is missing
2. Create it manually
3. Or run schema from beginning

### Issue 4: Permission Errors

**Error:** `permission denied`

**Fix:** Your database user needs CREATE privileges. Check with Render support if needed.

## Quick Test: Run Just admin_users

If the full migration is too complex, just create what you need:

```sql
-- Just create admin_users table
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

-- Insert admin user
INSERT INTO admin_users (id, username, name, email, password, role, is_active, created_at, updated_at)
VALUES (
  'admin_1',
  'Admin',
  'Super Admin',
  'admin@pbookspro.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  'super_admin',
  TRUE,
  NOW(),
  NOW()
)
ON CONFLICT (username) DO UPDATE 
SET password = EXCLUDED.password, is_active = TRUE, updated_at = NOW();
```

This will at least let you login to the admin portal.

---

**Please share the specific error message** you're seeing, and I can provide a targeted fix!

