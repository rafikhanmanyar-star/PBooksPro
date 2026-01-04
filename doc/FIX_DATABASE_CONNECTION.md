# Fix Database Connection Error: ENOTFOUND

The error `ENOTFOUND dpg-d5ced2h5pdvs73c8s4c0-a` means the database hostname cannot be resolved. This usually happens when using an internal database URL instead of the external one.

## The Problem

Render provides two types of database URLs:
1. **Internal URL** - Only works within Render's network (hostname like `dpg-xxx-a`)
2. **External URL** - Works from anywhere (hostname like `dpg-xxx-a.oregon-postgres.render.com`)

The API is trying to use the internal URL, which isn't resolving.

## Solution: Use External Database URL

### Step 1: Get External Database URL

1. **Go to Render Dashboard** → **pbookspro-db** (your database)
2. **Go to "Info" tab**
3. **Find "Internal Database URL"** and **"External Database URL"**
4. **Copy the External Database URL** (should have full hostname like `dpg-xxx-a.oregon-postgres.render.com`)

### Step 2: Update DATABASE_URL in Render

1. **Go to Render Dashboard** → **pbookspro-api** service
2. **Go to "Environment" tab**
3. **Find `DATABASE_URL`**
4. **Click to edit it**
5. **Replace with the External Database URL** you copied
6. **Save**

### Step 3: Restart API Service

After updating the environment variable:

1. **Go to "Events" tab**
2. **Click "Manual Deploy"** → **"Deploy latest commit"**
3. **Or just wait** - Render will auto-restart when env vars change

### Step 4: Verify Connection

After restart, check the logs:

1. **Go to "Logs" tab**
2. **Look for:** `✅ Connected to PostgreSQL database`
3. **If you see connection errors**, the URL might still be wrong

## Alternative: Check Database Connection String Format

The DATABASE_URL should look like:
```
postgresql://user:password@dpg-xxx-a.oregon-postgres.render.com:5432/dbname?sslmode=require
```

**NOT:**
```
postgresql://user:password@dpg-xxx-a:5432/dbname
```

The difference is the full hostname with `.oregon-postgres.render.com` (or your region).

## If External URL Doesn't Work

If the external URL also doesn't work:

1. **Check database status** - Make sure it's running
2. **Check database region** - Make sure API and DB are in same region (if using internal)
3. **Verify credentials** - Make sure username/password are correct

## Quick Fix: Update render.yaml

If you want to set it in `render.yaml`, you can't use `fromDatabase` for external URL. Instead:

1. **Get External Database URL** from Render Dashboard
2. **Manually set it** in Render Dashboard → Environment (as above)

The `fromDatabase` in render.yaml uses the internal URL, which is why it's not working.

---

**The fix: Use the External Database URL from Render Dashboard instead of the internal one!**

