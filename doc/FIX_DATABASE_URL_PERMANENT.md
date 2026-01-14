# Permanent Fix for DATABASE_URL Resetting to Internal Connection

## The Problem

Every time you merge staging with main or deploy the API server, the `DATABASE_URL` environment variable gets reset to the internal connection string instead of the external one. This happens because Render's `fromDatabase` property in `render.yaml` uses the internal connection by default.

## Permanent Solution

### Step 1: Remove fromDatabase Reference from render.yaml

The `render.yaml` file has been updated to comment out the `fromDatabase` reference for `DATABASE_URL`. This prevents Render from automatically resetting it.

**What Changed:**
- Production API: `DATABASE_URL` fromDatabase reference is now commented out
- Staging API: `DATABASE_URL` fromDatabase reference is now commented out

### Step 2: Set DATABASE_URL Manually in Render Dashboard

Since `render.yaml` no longer manages `DATABASE_URL`, you need to set it manually in the Render dashboard. This ensures it won't be overwritten on deployments.

#### For Production API (pbookspro-api):

1. **Go to Render Dashboard** → **pbookspro-api** service
2. **Go to "Environment" tab**
3. **Find `DATABASE_URL`** (or add it if it doesn't exist)
4. **Get External Database URL:**
   - Go to **pbookspro-db** database
   - Go to **"Info" tab**
   - Copy the **"External Database URL"** (NOT Internal)
   - Should look like: `postgresql://user:password@dpg-xxx-a.oregon-postgres.render.com:5432/dbname?sslmode=require`
5. **Paste the External Database URL** into the `DATABASE_URL` field
6. **Save** (service will auto-restart)

#### For Staging API (pbookspro-api-staging):

1. **Go to Render Dashboard** → **pbookspro-api-staging** service
2. **Go to "Environment" tab**
3. **Find `DATABASE_URL`** (or add it if it doesn't exist)
4. **Get External Database URL:**
   - Go to **pbookspro-db-staging** database
   - Go to **"Info" tab**
   - Copy the **"External Database URL"** (NOT Internal)
5. **Paste the External Database URL** into the `DATABASE_URL` field
6. **Save** (service will auto-restart)

### Step 3: Verify Connection

After setting the external URL:

1. **Check Logs:**
   - Go to API service → **"Logs" tab**
   - Look for: `✅ Connected to PostgreSQL database`
   - Should NOT see: `ENOTFOUND` errors

2. **Test API:**
   - Try accessing the API endpoints
   - Verify database operations work correctly

## Why This Works

- **Manual Environment Variables** in Render Dashboard are NOT overwritten by `render.yaml`
- **fromDatabase references** in `render.yaml` get reset on every deployment/sync
- By removing `fromDatabase` and setting it manually, the external URL persists across deployments

## Important Notes

1. **Keep External URL Secure:**
   - The external database URL contains credentials
   - Never commit it to git
   - Only set it in Render Dashboard

2. **If Database URL Changes:**
   - If you recreate the database or change credentials
   - You'll need to update `DATABASE_URL` manually in the dashboard again

3. **For New Environments:**
   - When setting up new services, always use the External Database URL
   - Don't use the Internal URL unless services are on the same private network

## Alternative: Using Internal URL (Not Recommended)

If you want to use the internal URL (only works within Render's network):

1. Keep services and database in the same region
2. Use `property: internalConnectionString` in render.yaml
3. This only works if all services are on Render's internal network

**However, using External URL is recommended** because:
- Works from anywhere
- More reliable
- Easier to debug
- Works with external tools (like local development)

## Troubleshooting

### If DATABASE_URL Still Gets Reset

1. **Check render.yaml:**
   - Make sure `fromDatabase` for `DATABASE_URL` is commented out
   - Verify no other references exist

2. **Check Render Dashboard:**
   - Go to Environment tab
   - Verify `DATABASE_URL` is set as a manual variable (not linked)
   - If it shows "Linked from database", unlink it and set manually

3. **After Manual Update:**
   - The service should auto-restart
   - Check logs to verify connection

### If Connection Still Fails

1. **Verify URL Format:**
   - Should include full hostname: `dpg-xxx-a.oregon-postgres.render.com`
   - Should include port: `:5432`
   - Should include SSL: `?sslmode=require`

2. **Check Database Status:**
   - Verify database is running
   - Check database region matches service region (for internal connections)

3. **Test Connection:**
   - Try connecting with a database client using the external URL
   - Verify credentials are correct

## Summary

✅ **Solution:** Remove `fromDatabase` reference from `render.yaml` and set `DATABASE_URL` manually in Render Dashboard  
✅ **Result:** External database URL persists across all deployments  
✅ **Benefit:** No more manual fixes needed after merges or deployments
