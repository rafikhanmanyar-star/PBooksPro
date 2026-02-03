# Clean Staging Database Script

This script cleans all data from the staging database while preserving WhatsApp tables.

## ⚠️ WARNING

**This script will permanently delete all data from the staging database except WhatsApp tables!**

- Only use this on the **STAGING** database
- Make sure you have backups if needed
- WhatsApp tables (`whatsapp_configs`, `whatsapp_messages`) will be preserved

## Prerequisites

1. Ensure `DATABASE_URL` is set in `server/.env` pointing to the staging database
2. The database URL should contain "staging" in the name or set `NODE_ENV=staging`

## Usage

### From server directory:

```bash
cd server
npm run clean-staging
```

### Direct execution:

```bash
cd server
tsx scripts/clean-staging-db.ts
```

## What the Script Does

1. **Connects** to the database using `DATABASE_URL` from `.env`
2. **Lists all tables** in the public schema
3. **Identifies WhatsApp tables** to preserve:
   - `whatsapp_configs`
   - `whatsapp_messages`
   - Any table with "whatsapp" in the name
4. **Shows row counts** for tables that will be cleaned
5. **Asks for confirmation** - you must type "DELETE ALL" (in uppercase) to proceed
6. **Truncates all other tables** using `TRUNCATE TABLE ... CASCADE`
7. **Verifies** WhatsApp tables are still intact

## Safety Features

- ✅ Checks if database URL appears to be staging
- ✅ Shows list of tables before deletion
- ✅ Shows row counts before deletion
- ✅ Requires explicit confirmation ("DELETE ALL")
- ✅ Preserves WhatsApp tables automatically
- ✅ Shows summary after completion

## Example Output

```
🔍 Connecting to database...
✅ Database connection successful

📊 Fetching list of tables...

📋 Found 45 tables:
   - 2 WhatsApp table(s) (will be preserved):
     ✓ whatsapp_configs
     ✓ whatsapp_messages
   - 43 table(s) to clean:
     ✗ accounts
     ✗ contacts
     ✗ transactions
     ...

📊 Checking row counts...

📈 Row counts:
   accounts: 1,234 rows
   contacts: 567 rows
   transactions: 8,901 rows
   ...

   Total rows to delete: 12,345

⚠️  WARNING: This will permanently delete all data from the above tables!
   WhatsApp tables will be preserved.

   Type "DELETE ALL" (in uppercase) to confirm: DELETE ALL

🧹 Starting cleanup...

   ✅ Cleaned: accounts
   ✅ Cleaned: contacts
   ✅ Cleaned: transactions
   ...

🔍 Verifying WhatsApp tables are preserved...
   ✅ whatsapp_configs: 5 rows (preserved)
   ✅ whatsapp_messages: 1,234 rows (preserved)

📊 Cleanup Summary:
   ✅ Successfully cleaned: 43 table(s)
   ✅ Preserved: 2 WhatsApp table(s)

✅ Cleanup completed!
```

## Troubleshooting

### "DATABASE_URL environment variable is not set"
- Create `server/.env` file with `DATABASE_URL=postgresql://...`

### "WARNING: DATABASE_URL does not appear to be staging!"
- The script detected the URL might not be staging
- You can still proceed by typing "yes" when prompted
- Double-check you're using the correct database URL

### Connection errors
- Verify database server is running
- Check network connectivity
- Verify credentials in DATABASE_URL

### Foreign key constraint errors
- The script uses `TRUNCATE ... CASCADE` which should handle foreign keys
- If errors occur, check the error message for specific table issues

## Notes

- The script uses `TRUNCATE TABLE ... CASCADE` which is faster than `DELETE FROM`
- Foreign key constraints are automatically handled by CASCADE
- Indexes and table structures are preserved (only data is deleted)
- WhatsApp tables and their data remain completely untouched
