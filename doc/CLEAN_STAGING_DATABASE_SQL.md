# Clean Staging Database - SQL Script for DBeaver

This SQL script allows you to clean all data from the staging database while preserving WhatsApp tables, directly from DBeaver.

## ⚠️ WARNING

**This script will permanently delete all data from the database except WhatsApp tables!**

- Only use this on the **STAGING** database
- Make sure you have backups if needed
- WhatsApp tables (`whatsapp_configs`, `whatsapp_messages`) will be preserved

## Quick Start

1. **Open DBeaver** and connect to your **STAGING** database
2. **Open** the file: `server/scripts/clean-staging-db.sql`
3. **Review** the tables that will be cleaned
4. **Scroll down** to the "Quick Clean Script" section (at the bottom)
5. **Uncomment** the entire block (remove `/*` and `*/`)
6. **Execute** the script (F5 or Execute button)

## Method 1: Quick Clean Script (Recommended)

The easiest way is to use the "Quick Clean Script" at the bottom of the SQL file:

```sql
-- Uncomment this entire block to execute
DO $$
DECLARE
    r RECORD;
    cleaned_count INTEGER := 0;
    preserved_count INTEGER := 0;
BEGIN
    FOR r IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          AND table_name NOT IN ('whatsapp_configs', 'whatsapp_messages')
          AND LOWER(table_name) NOT LIKE '%whatsapp%'
        ORDER BY table_name
    LOOP
        BEGIN
            EXECUTE format('TRUNCATE TABLE %I CASCADE', r.table_name);
            cleaned_count := cleaned_count + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Error cleaning %: %', r.table_name, SQLERRM;
        END;
    END LOOP;
    
    SELECT COUNT(*) INTO preserved_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND (table_name IN ('whatsapp_configs', 'whatsapp_messages') 
           OR LOWER(table_name) LIKE '%whatsapp%');
    
    RAISE NOTICE 'Cleanup complete! Cleaned: % tables, Preserved: % WhatsApp tables', cleaned_count, preserved_count;
END $$;
```

## Method 2: Dynamic SQL with Detailed Output

For more detailed output showing each table being cleaned:

1. Scroll to the "Dynamic SQL" section
2. Uncomment the entire block
3. Execute it

This will show:
- Each table being cleaned
- Each WhatsApp table being preserved
- Summary at the end

## Method 3: Manual TRUNCATE Statements

If you want to clean specific tables only:

1. Scroll to the "Manual TRUNCATE Statements" section
2. Uncomment the tables you want to clean
3. Execute

Example:
```sql
TRUNCATE TABLE accounts CASCADE;
TRUNCATE TABLE contacts CASCADE;
TRUNCATE TABLE transactions CASCADE;
-- etc.
```

## Before Running: Check Row Counts

Before cleaning, you can see how many rows will be deleted:

1. Find the "Show row counts" section
2. Uncomment the DO block
3. Execute to see row counts for all tables

## After Running: Verify WhatsApp Tables

After cleanup, verify WhatsApp tables are preserved:

```sql
SELECT 
    'whatsapp_configs' as table_name,
    COUNT(*) as row_count
FROM whatsapp_configs
UNION ALL
SELECT 
    'whatsapp_messages' as table_name,
    COUNT(*) as row_count
FROM whatsapp_messages;
```

## What Gets Preserved

The following tables are **automatically preserved**:
- `whatsapp_configs`
- `whatsapp_messages`
- Any table with "whatsapp" in the name (case-insensitive)

## What Gets Cleaned

All other tables in the `public` schema will be truncated:
- `accounts`
- `contacts`
- `transactions`
- `invoices`
- `projects`
- `tenants`
- `users`
- And all other non-WhatsApp tables

## Safety Features

- ✅ Uses `TRUNCATE ... CASCADE` to handle foreign key constraints
- ✅ Automatically identifies and preserves WhatsApp tables
- ✅ Shows detailed output of what's being cleaned
- ✅ Error handling for individual table failures
- ✅ Summary report at the end

## Troubleshooting

### "Permission denied" error
- Make sure you're connected as a user with TRUNCATE permissions
- You may need superuser or database owner privileges

### Foreign key constraint errors
- The script uses `CASCADE` which should handle this automatically
- If errors persist, check the specific table mentioned in the error

### Some tables not cleaned
- Check the error messages in the output
- Some system tables or views cannot be truncated
- The script will continue even if some tables fail

## Notes

- `TRUNCATE` is faster than `DELETE FROM` for large tables
- `CASCADE` automatically handles foreign key dependencies
- Table structures and indexes are preserved (only data is deleted)
- WhatsApp tables remain completely untouched
