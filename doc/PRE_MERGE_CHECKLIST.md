# Pre-Merge Checklist: Staging → Production

## ✅ Current Status

- [x] Staging API server is running
- [x] Staging Admin portal is running  
- [x] Staging Client application is running
- [x] User can register and login
- [x] Database connections working
- [x] SSL/TLS configured correctly

## 🔍 Pre-Merge Verification Steps

### 1. Test Critical Functionality in Staging

Before merging, verify these work in staging:

#### Authentication & Registration
- [ ] New tenant registration works
- [ ] User login works (both admin and regular users)
- [ ] Password reset works (if implemented)
- [ ] Session management works

#### Admin Portal
- [ ] Admin can login
- [ ] Can view tenants list
- [ ] Can view tenant details
- [ ] Can view tenant users
- [ ] Can create/edit/delete users for tenants
- [ ] Can manage licenses
- [ ] Can view dashboard stats

#### Client Application
- [ ] User can login
- [ ] Dashboard loads
- [ ] Can create/view transactions
- [ ] Can manage accounts
- [ ] Can manage contacts
- [ ] Can create/view invoices
- [ ] Can create/view bills
- [ ] Data persistence works (saves correctly)

#### Database
- [ ] All tables created correctly
- [ ] Migrations ran successfully
- [ ] No schema errors in logs
- [ ] Foreign key constraints working

### 2. Verify Production Environment Setup

#### Production Database
- [ ] Production database exists in Render (`pbookspro-db`)
- [ ] Production database is accessible
- [ ] Production database is in same region as API service

#### Production Services
- [ ] Production API service exists (`pbookspro-api`)
- [ ] Production Client service exists (`pbookspro-client`)
- [ ] Production Admin service exists (`pbookspro-admin`)

#### Environment Variables
Verify production services have correct environment variables:

**Production API (`pbookspro-api`):**
- [ ] `DATABASE_URL` - Points to production database (External URL)
- [ ] `JWT_SECRET` - Set and secure
- [ ] `LICENSE_SECRET_SALT` - Set (different from staging)
- [ ] `NODE_ENV=production`
- [ ] `CORS_ORIGIN` - Includes production client/admin URLs
- [ ] `API_URL` - Production API URL
- [ ] `CLIENT_URL` - Production client URL

**Production Client (`pbookspro-client`):**
- [ ] `VITE_API_URL` - Production API URL

**Production Admin (`pbookspro-admin`):**
- [ ] `VITE_ADMIN_API_URL` - Production API URL

### 3. Check for Breaking Changes

- [ ] Review all code changes since last production deployment
- [ ] Check for database schema changes that need migration
- [ ] Verify API endpoints haven't changed (backward compatibility)
- [ ] Check for new dependencies that need installation

### 4. Backup Production (If Data Exists)

- [ ] Backup production database (if it has data)
- [ ] Document current production version
- [ ] Note any custom configurations

### 5. Test Merge Process

#### Option A: Create Merge PR (Recommended)
- [ ] Create Pull Request: `staging` → `main`
- [ ] Review changes in PR
- [ ] Test merge in local branch first (optional)
- [ ] Merge PR when ready

#### Option B: Direct Merge
- [ ] Ensure you're on `staging` branch
- [ ] Pull latest changes
- [ ] Switch to `main` branch
- [ ] Merge `staging` into `main`
- [ ] Push to `main`

### 6. Post-Merge Verification

After merging, verify:

- [ ] Production services auto-deploy (check Render Dashboard)
- [ ] Production API migrations run successfully
- [ ] Production API health check passes
- [ ] Production client loads correctly
- [ ] Production admin portal loads correctly
- [ ] Can login to production with existing credentials
- [ ] No errors in production logs

## 🚨 Rollback Plan

If something goes wrong after merge:

1. **Revert the merge commit**:
   ```bash
   git revert -m 1 <merge-commit-hash>
   git push origin main
   ```

2. **Or rollback to previous commit**:
   ```bash
   git reset --hard <previous-commit-hash>
   git push origin main --force
   ```

3. **Check Render Dashboard**:
   - Services should auto-redeploy
   - Verify they're running correctly

## 📝 Recommended Merge Process

### Step 1: Final Staging Tests (Do Now)

Run these tests in staging:

```bash
# Test API health
curl https://pbookspro-api-staging.onrender.com/health

# Test version endpoint
curl https://pbookspro-api-staging.onrender.com/api/app-info/version

# Test client loads
# Open: https://pbookspro-client-staging.onrender.com

# Test admin loads
# Open: https://pbookspro-admin-staging.onrender.com
```

### Step 2: Create Merge PR

1. Go to GitHub repository
2. Create Pull Request: `staging` → `main`
3. Review all changes
4. Add description of what's being deployed
5. Request review (if team workflow)
6. Merge when approved

### Step 3: Monitor Deployment

1. Watch Render Dashboard for deployments
2. Check production API logs
3. Verify migrations run successfully
4. Test production endpoints

### Step 4: Post-Deployment Testing

1. Test production login
2. Test critical features
3. Monitor for errors
4. Check user feedback

## ⚠️ Important Notes

1. **Database Migrations**: Production database will run migrations automatically on API startup. Ensure migrations are idempotent (safe to run multiple times).

2. **Environment Variables**: Double-check all production environment variables are set correctly before merge.

3. **SSL/TLS**: Production should already have SSL enabled (we fixed this for staging, same code applies).

4. **Version Numbers**: Consider updating version in `package.json` before merge if you want to track releases.

5. **Downtime**: Render deployments may cause brief downtime (usually < 1 minute). Plan accordingly.

## ✅ Ready to Merge?

You're ready to merge if:

- ✅ All staging tests pass
- ✅ Production environment variables are verified
- ✅ Production database exists
- ✅ No breaking changes identified
- ✅ Rollback plan is understood
- ✅ Team is notified (if applicable)

## 🎯 Quick Merge Command

If everything checks out:

```bash
# Ensure you're on staging and up to date
git checkout staging
git pull origin staging

# Switch to main
git checkout main
git pull origin main

# Merge staging into main
git merge staging

# Push to production
git push origin main
```

Render will automatically deploy to production!

---

**Recommendation**: Create a Pull Request instead of direct merge for better visibility and review.
