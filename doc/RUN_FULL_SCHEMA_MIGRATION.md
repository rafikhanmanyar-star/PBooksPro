# Run Full Database Schema Migration

## Step-by-Step Guide

### Step 1: Open SQL Editor in DBeaver

1. Right-click your database connection
2. Select "SQL Editor" → "New SQL Script"
3. Or click the SQL Editor icon

### Step 2: Copy the Full Schema

1. Open `server/migrations/postgresql-schema.sql` in your project
2. Select ALL content (Ctrl+A)
3. Copy it (Ctrl+C)

### Step 3: Paste and Execute

1. Paste into DBeaver SQL Editor
2. Click "Execute SQL Script" (F5 or play button)
3. Wait for execution to complete

## Common Errors and Fixes

### Error 1: "relation already exists"

**If you see:** `ERROR: relation "table_name" already exists`

**Solution:** The schema uses `CREATE TABLE IF NOT EXISTS`, so this shouldn't happen. If it does:
- The table might have been created manually
- You can drop it first: `DROP TABLE IF EXISTS table_name CASCADE;`
- Then re-run the migration

### Error 2: "policy already exists"

**If you see:** `ERROR: policy "tenant_isolation_..." already exists`

**Solution:** The schema has `DROP POLICY IF EXISTS` before creating, so this should be handled. If you still see it:
- The DROP might have failed silently
- Manually drop: `DROP POLICY IF EXISTS policy_name ON table_name;`
- Then re-run

### Error 3: "extension already exists"

**If you see:** `ERROR: extension "uuid-ossp" already exists`

**Solution:** This is fine - `CREATE EXTENSION IF NOT EXISTS` handles it. You can ignore this.

### Error 4: "foreign key constraint"

**If you see:** Foreign key errors

**Solution:** Tables are created in the correct order in the schema. If you see this:
- Check which table is missing
- Create it manually first
- Or run the schema from the beginning

### Error 5: "permission denied"

**If you see:** Permission errors

**Solution:** Make sure you're connected as a user with CREATE privileges. The database user from Render should have these permissions.

## Recommended: Run in Sections

If the full schema fails, run it in sections:

### Section 1: Extensions and Core Tables

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tenants & Licensing
-- (Copy lines 11-85 from schema)
```

### Section 2: Admin Users

```sql
-- Admin Users
-- (Copy lines 87-100 from schema)
```

### Section 3: Users & Financial

```sql
-- Users & Financial Data
-- (Copy lines 102-205 from schema)
```

### Section 4: Projects & Properties

```sql
-- Projects & Properties
-- (Copy lines 207-268 from schema)
```

### Section 5: Invoices & Bills

```sql
-- Invoices & Bills
-- (Copy lines 270-432 from schema)
```

### Section 6: Indexes

```sql
-- Indexes
-- (Copy lines 434-464 from schema)
```

### Section 7: RLS Policies

```sql
-- RLS Policies
-- (Copy lines 466-585 from schema)
```

## Quick Fix: Just Create What You Need

If you only need admin login right now:

1. Run `CREATE_ADMIN_USERS_TABLE.sql` (already created)
2. This creates just the `admin_users` table
3. You can run the full schema later

## Verify Migration Success

After running the migration, check:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- Should show:
-- admin_users
-- tenants
-- users
-- accounts
-- contacts
-- categories
-- transactions
-- projects
-- buildings
-- properties
-- units
-- invoices
-- bills
-- budgets
-- rental_agreements
-- project_agreements
-- contracts
-- license_keys
-- license_history
```

## If Migration Fails Completely

1. **Check the specific error message** in DBeaver
2. **Note which line/table failed**
3. **Run that section separately**
4. **Or share the error** and I can help fix it

---

**Tip:** Run the full schema in one go if possible. The `IF NOT EXISTS` clauses should prevent duplicate errors.

