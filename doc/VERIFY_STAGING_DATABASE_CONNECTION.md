# Verify Staging Database Connection

## Step-by-Step Verification Guide

### Step 1: Verify Database Exists in Render Dashboard

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Look for**: `pbookspro-db-staging` in your services list
3. **Check Status**: Should show green "Active" status
4. **Note the database URL**:
   - Click on `pbookspro-db-staging`
   - Go to "Info" tab
   - Copy the **External Database URL** (we'll use this to verify)

### Step 2: Verify API Service Has Database Linked

1. **Go to API Service**: `pbookspro-api-staging`
2. **Go to "Environment" tab**
3. **Check `DATABASE_URL` variable**:
   - Should exist
   - Should reference `pbookspro-db-staging`
   - Or show the External Database URL

**If DATABASE_URL is missing or wrong:**
- Click "Link Database" or "Add Environment Variable"
- Key: `DATABASE_URL`
- Value: Select `pbookspro-db-staging` from dropdown (if available)
- Or paste the External Database URL manually
- Save changes (service will auto-redeploy)

### Step 3: Check API Service Logs

1. **Go to**: `pbookspro-api-staging` service
2. **Go to "Logs" tab**
3. **Look for these success messages**:
   ```
   ✅ Connected to PostgreSQL database
   🔄 Running database migrations...
   ✅ Database migrations completed successfully
   ✅ Admin user ready
   ```

**If you see errors:**
- `relation "user_sessions" does not exist` - This is OK (we fixed this, will be resolved after next deployment)
- `ENOTFOUND` - Database URL might be Internal instead of External
- Connection timeout - Database might be sleeping (first request will wake it)

### Step 4: Test Health Endpoint

**Test the API health endpoint:**

1. **Open browser or use curl**:
   ```
   https://pbookspro-api-staging.onrender.com/health
   ```

2. **Expected response**:
   ```json
   {
     "status": "ok",
     "timestamp": "2024-01-15T10:30:00.000Z",
     "database": "connected"
   }
   ```

3. **If `database: "disconnected"`**:
   - Check DATABASE_URL is set correctly
   - Check database service is running
   - Check API service logs for connection errors

### Step 5: Test Version Endpoint (Verify Full Stack)

1. **Test version API**:
   ```
   https://pbookspro-api-staging.onrender.com/api/app-info/version
   ```

2. **Expected response**:
   ```json
   {
     "version": "1.1.2",
     "buildDate": "...",
     "environment": "staging"
   }
   ```

### Step 6: Verify Database Tables Were Created

**Option A: Use Render Dashboard**
1. Go to `pbookspro-db-staging` database
2. Click "Connect" or "psql" (if available)
3. Run: `\dt` to list tables
4. Should see tables like: `tenants`, `users`, `transactions`, etc.

**Option B: Test via API (if authenticated)**
1. Log in to staging admin portal
2. Try accessing data endpoints
3. If data loads, database connection is working

### Step 7: Check Connection String Format

The DATABASE_URL should be in this format:
```
postgresql://user:password@dpg-xxxxx-a.oregon-postgres.render.com:5432/database_name
```

**Key points:**
- Must start with `postgresql://` or `postgres://`
- Must include `.render.com` in hostname (External URL)
- Must include port (usually `:5432`)
- Must include database name at the end

**Common issues:**
- ❌ Missing `.render.com` → Internal URL (won't work)
- ❌ Missing port → Connection might fail
- ❌ Wrong database name → Connection fails

## Quick Test Commands

### Test from Browser/curl

```bash
# Health check
curl https://pbookspro-api-staging.onrender.com/health

# Version info
curl https://pbookspro-api-staging.onrender.com/api/app-info/version

# Root endpoint
curl https://pbookspro-api-staging.onrender.com/
```

### Test from PowerShell (Windows)

```powershell
# Health check
Invoke-RestMethod -Uri "https://pbookspro-api-staging.onrender.com/health"

# Version info
Invoke-RestMethod -Uri "https://pbookspro-api-staging.onrender.com/api/app-info/version"
```

## Expected Results

### ✅ Connection Working

- Health endpoint returns: `{ "status": "ok", "database": "connected" }`
- API logs show: `✅ Connected to PostgreSQL database`
- Migrations completed successfully
- No database connection errors in logs

### ❌ Connection Not Working

- Health endpoint returns: `{ "status": "ok", "database": "disconnected" }`
- API logs show connection errors
- Service fails to start or crashes

## Troubleshooting

### Database shows as "disconnected" in health check

1. **Check DATABASE_URL**:
   - Go to API service → Environment tab
   - Verify DATABASE_URL is set
   - Verify it uses External Database URL

2. **Check database status**:
   - Database service should be "Active" (green)
   - Not sleeping or paused

3. **Check API service logs**:
   - Look for connection error messages
   - Check if using Internal vs External URL

4. **Manually set DATABASE_URL**:
   - Copy External Database URL from database Info tab
   - Paste into API service Environment variables
   - Save and wait for redeploy

### Connection timeout errors

- **First request after inactivity**: Database might be sleeping (Render free tier)
- **Wait 30-60 seconds** after first request for database to wake up
- Subsequent requests should be faster

### Migration errors

- **Check logs** for specific migration errors
- **Tables might not be created** - migrations may need to run manually
- **Fix**: Service logs should show migration status

## Next Steps After Verification

Once connection is verified:

1. ✅ Test staging client application
2. ✅ Test staging admin portal  
3. ✅ Verify migrations created all tables
4. ✅ Test login functionality
5. ✅ If everything works, merge to production
