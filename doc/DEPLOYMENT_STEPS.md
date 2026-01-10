# Step-by-Step Deployment Guide

## Current Status ✅

All code changes have been implemented:
- ✅ Staging database configuration added
- ✅ Staging services configured in render.yaml
- ✅ Environment variables updated
- ✅ Version checking API endpoint created
- ✅ Version service implemented
- ✅ Update notification component created
- ✅ Service worker updated for manual updates

## Next Steps

### Step 1: Add Missing Branch Configuration (1 minute)

The production client service in `render.yaml` needs `branch: main` added.

**File**: `render.yaml` (line 41)

**Current**:
```yaml
  # Client Application (Static Site)
  - type: web
    name: pbookspro-client
    runtime: static
    buildCommand: npm install && npm run build
```

**Should be**:
```yaml
  # Client Application (Static Site)
  - type: web
    name: pbookspro-client
    runtime: static
    branch: main
    buildCommand: npm install && npm run build
```

**Action**: Manually add `branch: main` after `runtime: static` line.

---

### Step 2: Test Locally (5-10 minutes)

Before deploying, test the version checking locally:

1. **Start the server locally**:
   ```powershell
   cd server
   npm install
   npm run dev
   ```

2. **Test the version API endpoint**:
   - Open browser: `http://localhost:3000/api/app-info/version`
   - Should return:
     ```json
     {
       "version": "1.1.2",
       "buildDate": "...",
       "environment": "development"
     }
     ```

3. **Build the client to test version injection**:
   ```powershell
   npm install
   npm run build
   ```
   - Check `dist/index.html` or browser console - should show `APP_VERSION` injected

4. **Start client dev server** (optional):
   ```powershell
   npm run dev
   ```

---

### Step 3: Commit and Push to Staging Branch (2 minutes)

1. **Check current branch**:
   ```powershell
   git branch
   ```

2. **Switch to staging branch** (if not already on it):
   ```powershell
   git checkout staging
   ```

3. **Add all changes**:
   ```powershell
   git add .
   ```

4. **Commit changes**:
   ```powershell
   git commit -m "Add staging and production environment setup with version checking system"
   ```

5. **Push to staging branch**:
   ```powershell
   git push origin staging
   ```

**What happens**: Render will automatically detect the push and start deploying staging services.

---

### Step 4: Monitor Staging Deployment (5-15 minutes)

1. **Go to Render Dashboard**: https://dashboard.render.com

2. **Check deployment status**:
   - Look for new services being created:
     - `pbookspro-api-staging`
     - `pbookspro-client-staging`
     - `pbookspro-admin-staging`
     - `pbookspro-db-staging` (database)

3. **Wait for deployments to complete**:
   - Green checkmark = successful
   - Yellow = deploying
   - Red = error (check logs)

4. **Check service logs** if errors occur:
   - Click on each service
   - View "Logs" tab
   - Look for error messages

---

### Step 5: Test Staging Environment (10 minutes)

1. **Access staging URLs**:
   - Client: `https://pbookspro-client-staging.onrender.com`
   - Admin: `https://pbookspro-admin-staging.onrender.com`
   - API: `https://pbookspro-api-staging.onrender.com`

2. **Test version API**:
   - Visit: `https://pbookspro-api-staging.onrender.com/api/app-info/version`
   - Should return version information

3. **Test client application**:
   - Open staging client URL
   - Open browser DevTools (F12)
   - Check console for version info
   - Verify no errors

4. **Test version checking** (if you bump version):
   - Edit `package.json`: change version to `1.1.3`
   - Push to staging again
   - Wait for deployment
   - Should see update notification appear (after ~30 seconds + up to 5 minutes)

---

### Step 6: Initialize Staging Database (5 minutes)

The staging database will be empty. Run migrations:

1. **Option A: Auto-migration** (if configured):
   - Should run automatically on first API start
   - Check API logs for migration messages

2. **Option B: Manual migration** (if needed):
   ```powershell
   cd server
   npm run migrate
   ```

3. **Create admin user** (if needed):
   ```powershell
   npm run create-admin
   ```

---

### Step 7: Merge to Production (2 minutes)

Once staging is tested and working:

1. **Switch to main branch**:
   ```powershell
   git checkout main
   ```

2. **Merge staging into main**:
   ```powershell
   git merge staging
   ```

3. **Push to main**:
   ```powershell
   git push origin main
   ```

**What happens**: Render will automatically deploy to production services:
- `pbookspro-api`
- `pbookspro-client`
- `pbookspro-admin`

---

### Step 8: Monitor Production Deployment (5-15 minutes)

1. **Check Render Dashboard**:
   - Monitor production service deployments
   - Ensure all services show green (deployed)

2. **Test production URLs**:
   - Client: `https://pbookspro-client.onrender.com`
   - Admin: `https://pbookspro-admin.onrender.com`
   - API: `https://pbookspro-api.onrender.com/api/app-info/version`

---

### Step 9: Test Version Update System (5 minutes)

To verify the update notification system works:

1. **Bump version in package.json**:
   ```json
   {
     "version": "1.1.3"
   }
   ```

2. **Commit and push to main**:
   ```powershell
   git add package.json
   git commit -m "Bump version to 1.1.3"
   git push origin main
   ```

3. **Wait for deployment** (5-10 minutes)

4. **Test update notification**:
   - Open production client
   - Wait up to 5 minutes (periodic check)
   - Should see update notification in top-right corner
   - Test "Update Now" button
   - Test "Later" button

---

## Troubleshooting

### Staging services not appearing in Render

- **Check**: Are you on the `staging` branch?
- **Check**: Does `render.yaml` have correct `branch: staging` for staging services?
- **Check**: Did you push to `origin staging`?

### Database connection errors

- **Check**: Database service is created (`pbookspro-db-staging`)
- **Check**: `DATABASE_URL` environment variable is set correctly
- **Check**: Use External Database URL (not Internal) from Render dashboard

### Version API not working

- **Check**: Server is running
- **Check**: Route is registered in `server/api/index.ts`
- **Check**: `package.json` exists in parent directory of server

### Update notification not appearing

- **Check**: Service worker is registered (DevTools → Application → Service Workers)
- **Check**: Version was actually bumped and deployed
- **Check**: Wait up to 5 minutes (periodic check interval)
- **Check**: Browser console for errors

### CORS errors

- **Check**: `CORS_ORIGIN` includes staging URLs
- **Check**: URLs match exactly (no trailing slashes)

---

## Quick Checklist

Before going to production:

- [ ] Added `branch: main` to production client in render.yaml
- [ ] Tested version API locally (`/api/app-info/version`)
- [ ] Tested staging deployment successfully
- [ ] Verified staging database is set up
- [ ] Tested staging client/admin apps
- [ ] Verified no errors in staging logs
- [ ] Merged staging to main
- [ ] Monitored production deployment
- [ ] Tested production URLs
- [ ] Verified version update system works

---

## Important Notes

1. **First deployment takes longer** (10-15 minutes) - creating services and databases
2. **Staging services may sleep** after inactivity (Render free tier)
3. **Version checks happen every 5 minutes** - be patient when testing
4. **Service worker updates require manual trigger** - user must click "Update Now"
5. **Database migrations** may need to run manually for staging

---

## Need Help?

- Check Render dashboard logs for detailed error messages
- Review `doc/ENVIRONMENT_SETUP.md` for environment configuration
- Review `doc/VERSION_UPDATE_SYSTEM.md` for version system details
- Check browser console (F12) for client-side errors
