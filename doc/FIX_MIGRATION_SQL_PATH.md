# Fix: Migration SQL File Not Found

The migration script can't find `postgresql-schema.sql` because TypeScript doesn't copy `.sql` files to the `dist` folder.

## What I Fixed

Updated `server/scripts/run-migrations-on-startup.ts` to try multiple paths to find the SQL file:
1. `dist/migrations/postgresql-schema.sql` (if copied)
2. `migrations/postgresql-schema.sql` (source directory)
3. `server/migrations/postgresql-schema.sql` (from project root)
4. `process.cwd()/migrations/postgresql-schema.sql` (absolute path)

This ensures it works in both development and production.

## Deploy the Fix

```powershell
git add server/scripts/run-migrations-on-startup.ts
git commit -m "Fix migration SQL file path resolution"
git push
```

## After Deployment

1. **Wait for rebuild** (2-5 minutes)
2. **Check API logs:**
   - Should see: `📋 Reading schema from: ...`
   - Should see: `✅ Database migrations completed successfully`
   - Should see: `✅ Admin user ready`

## Alternative: Skip Migration on Startup

If migrations are already done and you want to skip them:

1. **Comment out the migration call** in `server/api/index.ts`:
   ```typescript
   // Run migrations on startup (non-blocking)
   // (async () => {
   //   try {
   //     const { runMigrations } = await import('../scripts/run-migrations-on-startup.js');
   //     await runMigrations();
   //   } catch (error) {
   //     console.warn('⚠️  Could not run migrations on startup:', error);
   //   }
   // })();
   ```

2. **Run migrations manually** when needed using the create-admin endpoint or DBeaver.

---

**The path fix should work - it will find the SQL file in the source directory even in production!**

