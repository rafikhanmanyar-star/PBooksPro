# Run Contracts user_id Migration

This guide shows you how to add the `user_id` column to the `contracts` table to track which user created/updated each contract.

## Method 1: Using DBeaver (Recommended - Easiest) ✅

### Step 1: Open DBeaver
1. Open DBeaver and connect to your PostgreSQL database
2. Make sure you're connected to the correct database (usually `pbookspro`)

### Step 2: Open SQL Editor
1. Right-click on your database connection
2. Select **"SQL Editor"** → **"New SQL Script"**
3. Or click the SQL Editor icon in the toolbar

### Step 3: Copy and Paste Migration SQL
1. Open the file: `server/migrations/add-user-id-to-contracts.sql`
2. Copy the **entire contents** of the file (Ctrl+A, Ctrl+C)
3. Paste into DBeaver SQL Editor (Ctrl+V)

### Step 4: Execute the Migration
1. Click the **"Execute SQL Script"** button (or press **F5**)
2. Wait for execution to complete
3. Check the output panel for any errors

### Step 5: Verify the Migration
Run this query to verify the column was added:

```sql
-- Check if user_id column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'contracts' AND column_name = 'user_id';

-- Check if index exists
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'contracts' AND indexname = 'idx_contracts_user_id';
```

**Expected Result:**
- You should see `user_id` column with `data_type = 'text'` and `is_nullable = 'YES'`
- You should see the index `idx_contracts_user_id`

---

## Method 2: Using Command Line Script (Automated)

### Prerequisites
- Node.js installed
- `DATABASE_URL` environment variable set in `.env` file
- TypeScript execution tool (`tsx` or compiled JavaScript)

### Step 1: Install tsx (if not already installed)
```bash
npm install -g tsx
# or
npm install --save-dev tsx
```

### Step 2: Run the Migration Script

**Option A: Using tsx (TypeScript execution)**
```bash
npx tsx server/scripts/add-user-id-to-contracts-migration.ts
```

**Option B: Using compiled JavaScript**
```bash
# First, compile TypeScript (if not already compiled)
npm run build

# Then run the compiled script
node dist/scripts/add-user-id-to-contracts-migration.js
```

### Step 3: Check Output
You should see:
```
🔄 Running user_id migration for contracts table...
📋 Reading migration from: [path]
✅ user_id migration completed successfully!
   The contracts table now has a user_id column.
✅ Migration script completed
```

---

## Method 3: Direct SQL Execution (psql)

If you have `psql` command-line tool installed:

```bash
# Connect to your database
psql $DATABASE_URL

# Then run the SQL file
\i server/migrations/add-user-id-to-contracts.sql

# Or paste the SQL directly
```

---

## Troubleshooting

### Error: "column user_id already exists"
**Solution:** The migration has already been applied. This is safe to ignore.

### Error: "relation contracts does not exist"
**Solution:** The contracts table hasn't been created yet. Run the main schema migration first:
```sql
-- Run the full schema from:
-- server/migrations/postgresql-schema.sql
```

### Error: "permission denied"
**Solution:** Make sure your database user has ALTER TABLE permissions. You may need to run as a superuser or grant permissions.

### Error: "foreign key constraint"
**Solution:** The migration checks if the constraint exists before creating it. If you see this error, the constraint might already exist. Check with:
```sql
SELECT conname FROM pg_constraint WHERE conname = 'contracts_user_id_fkey';
```

---

## What This Migration Does

1. **Adds `user_id` column** to `contracts` table (nullable for existing records)
2. **Creates foreign key constraint** linking to `users` table
3. **Creates index** on `user_id` for better query performance
4. **Safe for existing data** - existing contracts will have `user_id = NULL`

---

## After Migration

Once the migration is complete:
- ✅ New contracts will automatically have `user_id` set when created/updated
- ✅ The API routes already support saving `user_id` (already updated)
- ✅ Existing contracts will have `user_id = NULL` (you can update them manually if needed)

---

## Verify Everything Works

After running the migration, test by:
1. Creating a new contract through the UI
2. Checking the database to see if `user_id` is populated:
   ```sql
   SELECT id, contract_number, name, user_id 
   FROM contracts 
   ORDER BY created_at DESC 
   LIMIT 5;
   ```

---

**Recommended:** Use **Method 1 (DBeaver)** as it's the simplest and you can see the results immediately.

