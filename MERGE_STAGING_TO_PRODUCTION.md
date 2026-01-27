# Git Commands: Merge Staging to Production

This guide provides step-by-step git commands to merge the `staging` branch into `production` (or `main`) to upgrade production, including verification steps for database migrations.

## Prerequisites
- Ensure you have a clean working directory (no uncommitted changes)
- Ensure you have the latest changes from both branches
- Ensure staging has been tested and is ready for production
- Backup production database before upgrading (recommended)

## Quick Start: Automated Script

**Easiest way:** Use the PowerShell script:
```powershell
.\merge-to-production.ps1
```

This script automates all steps below and includes verification.

## Step-by-Step Commands (Manual)

### 1. Check git status
```powershell
git status
```
Ensure working directory is clean (no uncommitted changes).

### 2. Update staging branch
```powershell
git checkout staging
git pull origin staging
```

### 3. Create backup tag
```powershell
git checkout main
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
git tag "backup-before-merge-$timestamp"
```

### 4. Switch to production and merge
```powershell
git checkout main
git pull origin main
git merge staging --no-ff -m "Merge staging to production: $timestamp"
```

### 5. Push to production
```powershell
git push origin main
git push origin --tags
```

## Complete Command Sequence (PowerShell)

```powershell
# 1. Check status
git status

# 2. Update staging
git checkout staging
git pull origin staging

# 3. Create backup and merge
git checkout main
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
git tag "backup-before-merge-$timestamp"
git pull origin main
git merge staging --no-ff -m "Merge staging to production: $timestamp"

# 4. Push to production
git push origin main
git push origin --tags

# 5. After deployment completes, verify migrations
cd server
npm run verify-rental-migration
```

## Complete Command Sequence (Bash/Git Bash)

```bash
# 1. Check status
git status

# 2. Update staging
git checkout staging
git pull origin staging

# 3. Create backup and merge
git checkout main
timestamp=$(date +"%Y%m%d-%H%M%S")
git tag "backup-before-merge-$timestamp"
git pull origin main
git merge staging --no-ff -m "Merge staging to production: $timestamp"

# 4. Push to production
git push origin main
git push origin --tags

# 5. After deployment completes, verify migrations


```

## Handling Merge Conflicts

If merge conflicts occur:
1. Resolve conflicts manually in affected files
2. Stage resolved files: `git add .`
3. Complete merge: `git commit`
4. Push: `git push origin main`

## Post-Deployment Verification Steps

After merging and deploying to production:

### 1. Verify Database Migrations

```bash
cd server
npm run verify-rental-migration
```

**Expected Output:**
```
✅ ALL MIGRATIONS COMPLETED SUCCESSFULLY
   - org_id column exists with all constraints and indexes
   - contact_id column exists with all constraints and indexes
   - No legacy tenant_id column
   - All data integrity checks passed
```

### 2. Check Server Logs

Look for migration completion in server startup logs:
```
🔄 Running database migrations...
📋 Running org_id migration from: ...
✅ org_id migration completed
📋 Running contact_id migration from: ...
✅ contact_id migration completed
```

### 3. Test Rental Agreements API

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-production-api.com/api/rental-agreements
```

**Expected:** `200 OK` with rental agreements array

### 4. Monitor for Errors

Watch server logs for:
- ❌ Database errors related to `org_id` or `contact_id`
- ❌ 500 errors on `/api/rental-agreements` endpoint
- ⚠️ Migration warnings (should be investigated)

## Complete Workflow Summary

**Pre-Merge:**
1. ✅ Test staging thoroughly
2. ✅ Create database backup (if possible)
3. ✅ Ensure all migrations are included in staging

**Merge Process:**
1. Update staging: `git checkout staging && git pull origin staging`
2. Switch to main: `git checkout main && git pull origin main`
3. Create backup tag: `git tag backup-before-merge-YYYYMMDD-HHMMSS`
4. Merge: `git merge staging`
5. Push: `git push origin main --tags`

**Post-Merge:**
1. ✅ Wait for deployment to complete
2. ✅ Run `cd server && npm run verify-rental-migration`
3. ✅ Check server logs for migration completion
4. ✅ Test rental agreements API endpoint
5. ✅ Monitor for errors in logs

## Important Notes

1. **Branch Name**: If your production branch is named `master` or `production` instead of `main`, replace `main` with your actual production branch name in all commands.

2. **Automatic Migrations**: Database migrations run automatically on server startup. You don't need to run SQL manually unless migrations fail.

3. **Migration Status**: After deployment, the server logs will show migration status. If migrations fail, check logs for error details.

4. **Rollback**: If something goes wrong, use the backup tag:
   ```powershell
   git checkout backup-before-merge-YYYYMMDD-HHMMSS
   git checkout -b hotfix-rollback
   git push origin hotfix-rollback
   ```

5. **Testing**: Always test staging thoroughly before merging to production.

## Troubleshooting

### If migrations don't run automatically:
- Check server logs for migration errors
- Verify migration files are in `server/migrations/` directory
- Manually run migrations using the SQL files if needed

### If verification script shows issues:
- Check the detailed output for specific missing columns/constraints
- Run the appropriate migration SQL file manually
- Re-run verification: `npm run verify-rental-migration`
