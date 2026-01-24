# WhatsApp Migration Fix

## Problem
Error: `relation "whatsapp_configs" does not exist`

This means the WhatsApp database tables haven't been created yet.

## Solution

### Option 1: Restart Server (Recommended)
The migration will run automatically on server startup. Simply restart your server:

```bash
# Stop the server (Ctrl+C)
# Then start it again
cd server
npm run dev
```

You should see in the logs:
```
📋 Running WhatsApp integration migration from: ...
✅ WhatsApp integration migration completed
```

### Option 2: Run Migration Manually

If you need to run it immediately without restarting:

```bash
cd server
npx tsx scripts/run-whatsapp-migration.ts
```

Or using the migration script directly:

```bash
cd server
npx tsx scripts/run-whatsapp-migration.ts
```

### Option 3: Run SQL Directly

If you have direct database access, you can run the SQL file:

```bash
# Using psql
psql $DATABASE_URL -f server/migrations/add-whatsapp-integration.sql

# Or using your database client
# Just execute the contents of: server/migrations/add-whatsapp-integration.sql
```

## Verification

After running the migration, verify the tables exist:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('whatsapp_configs', 'whatsapp_messages');

-- Should return:
-- whatsapp_configs
-- whatsapp_messages
```

## What Was Fixed

1. ✅ Added WhatsApp migration to `server/scripts/run-migrations-on-startup.ts`
2. ✅ Migration will now run automatically on server startup
3. ✅ Tables will be created: `whatsapp_configs` and `whatsapp_messages`

## Next Steps

1. Restart your server (or run migration manually)
2. Try saving WhatsApp configuration again
3. The error should be resolved!

---

**Note**: The migration uses `CREATE TABLE IF NOT EXISTS`, so it's safe to run multiple times.
