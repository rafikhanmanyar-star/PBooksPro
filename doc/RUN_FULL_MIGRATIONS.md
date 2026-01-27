# Run Full Database Migrations

The `admin_users` table doesn't exist because the database migrations haven't run yet. You have two options:

## Option 1: Create Just admin_users Table (Quick) ✅

If you only need the admin user right now, run this SQL in DBeaver:

See `CREATE_ADMIN_USERS_TABLE.sql` - it creates the table and inserts the admin user.

**Steps:**
1. In DBeaver, right-click your database connection
2. Select "SQL Editor" → "New SQL Script"
3. Copy and paste the contents of `CREATE_ADMIN_USERS_TABLE.sql`
4. Run the script (F5 or Execute button)
5. Done!

## Option 2: Run Full Schema (Recommended)

If you want all tables created (for full functionality), you need to run the complete schema.

### Method A: Copy Full Schema SQL

1. Open `server/migrations/postgresql-schema.sql` in your project
2. Copy the entire file content
3. In DBeaver, open SQL Editor
4. Paste the entire schema
5. Execute it

### Method B: Check Server Logs

The migrations should run automatically when your API server starts. Check:

1. Go to Render Dashboard → API Service → Logs
2. Look for messages like:
   - "🔄 Running database migrations..."
   - "✅ Database migrations completed successfully"
   - "✅ Admin user ready"

If you see errors, the migrations failed. You'll need to run them manually.

### Method C: Trigger Migration via API

If the server is running, you could trigger migrations, but the easiest is to run the SQL directly.

## Quick Fix: Just Create admin_users

**Fastest solution:** Run the SQL in `CREATE_ADMIN_USERS_TABLE.sql` - it will:
1. Create the `admin_users` table
2. Insert the admin user
3. Verify it was created

Then you can login to the admin portal!

---

**After creating the admin user, you can run the full schema later if needed for other features.**

