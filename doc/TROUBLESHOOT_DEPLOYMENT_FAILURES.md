# Troubleshooting Deployment Failures

## Current Status

From your Render dashboard:
- ✅ **pbookspro-client** - Deployed successfully
- ❌ **pbookspro-api** - Deployment failed
- ❌ **pbookspro-admin** - Deployment failed

## Step 1: Check Build Logs

The most important step is to check the build logs for each failed service:

### For API Service (pbookspro-api)

1. Go to Render Dashboard
2. Click on **pbookspro-api** service
3. Go to **Logs** tab
4. Look for error messages

**Common errors:**
- `DATABASE_URL is not set` - Expected, we'll fix this
- TypeScript compilation errors
- Missing dependencies
- Build command failures

### For Admin Static Site (pbookspro-admin)

1. Go to Render Dashboard
2. Click on **pbookspro-admin** service
3. Go to **Logs** tab
4. Look for error messages

**Common errors:**
- Build command failures
- TypeScript errors
- Missing dependencies
- Wrong output directory

## Step 2: Fix API Service (Missing DATABASE_URL)

The API service likely fails because `DATABASE_URL` is missing. We have two options:

### Option A: Add Placeholder DATABASE_URL (Temporary)

Update `render.yaml` to include a placeholder:

```yaml
envVars:
  - key: DATABASE_URL
    value: "postgresql://placeholder"  # Temporary - will be updated manually
```

This allows the service to deploy, then you update it manually.

### Option B: Create Database First (Recommended)

1. **Create database in Render Dashboard**
2. **Then update render.yaml** to link it:
   ```yaml
   - key: DATABASE_URL
     fromDatabase:
       name: pbookspro-database
       property: connectionString
   ```
3. **Push and redeploy**

## Step 3: Fix Admin Static Site

The admin build might be failing due to:

### Issue 1: Build Command Path

The build command runs from root, then `cd admin`. This should work, but let's verify the output path.

**Current:**
```yaml
buildCommand: cd admin && npm install && npm run build
staticPublishPath: ./admin/dist
```

**Check:** Does `admin/dist` exist after build? The build might output to just `dist` inside admin folder.

### Issue 2: TypeScript Compilation

The admin uses `tsc && vite build`. If TypeScript has errors, the build fails.

**Solution:** Check TypeScript errors in build logs.

### Issue 3: Missing Dependencies

**Solution:** Verify all dependencies are in `admin/package.json`.

## Quick Fixes to Try

### Fix 1: Add DATABASE_URL Placeholder

Update `render.yaml`:

```yaml
envVars:
  - key: DATABASE_URL
    value: "postgresql://placeholder"  # Update manually after deployment
```

### Fix 2: Verify Admin Build Output

Check if admin builds to `admin/dist` or just `dist`. Update `staticPublishPath` accordingly.

### Fix 3: Check Admin Build Command

Try changing the build command to be more explicit:

```yaml
buildCommand: cd admin && npm ci && npm run build
```

## Detailed Troubleshooting Steps

### For API Service

1. **Check if service was created**
   - Even if deploy failed, the service might exist
   - Go to Services → pbookspro-api

2. **Check Environment Variables**
   - Go to Environment tab
   - Verify all variables are set
   - DATABASE_URL might be missing (expected)

3. **Check Build Logs**
   - Look for specific error messages
   - Common: TypeScript errors, missing files, path issues

4. **Check Runtime Logs**
   - If build succeeded but service won't start
   - Look for startup errors
   - Common: DATABASE_URL missing, port conflicts

### For Admin Static Site

1. **Check Build Logs**
   - Look for npm install errors
   - Look for TypeScript compilation errors
   - Look for Vite build errors

2. **Verify Output Directory**
   - Check if `admin/dist` exists after build
   - Or if it's just `dist` inside admin folder
   - Update `staticPublishPath` accordingly

3. **Check Dependencies**
   - Verify all packages in `admin/package.json`
   - Check for peer dependency warnings

## Recommended Action Plan

### Immediate Steps

1. **Check build logs** for both failed services
2. **Share the error messages** so we can fix them specifically
3. **Create database** if you haven't already
4. **Update DATABASE_URL** in API service environment

### If You Can Share Logs

Please share:
- API service build log errors
- Admin service build log errors
- Any runtime errors

This will help identify the exact issue.

## Alternative: Manual Service Creation

If Blueprint continues to fail, you can create services manually:

1. **Create API Service manually**
   - Set all environment variables
   - Link database
   - Deploy

2. **Create Admin Static Site manually**
   - Set build command
   - Set output directory
   - Deploy

This gives you more control and better error messages.

---

**Next Step:** Check the build logs in Render Dashboard and share the specific error messages. This will help us fix the exact issues.

