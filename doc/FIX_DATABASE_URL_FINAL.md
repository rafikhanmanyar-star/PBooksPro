# Fix Database Connection Error (ENOTFOUND)

The error `getaddrinfo ENOTFOUND dpg-d5ced2h5pdvs73c8s4c0-a` means the API server can't connect to the database because it's using the internal database URL instead of the external one.

## The Problem

Render provides two database URLs:
1. **Internal URL** - Only works within Render's network (hostname like `dpg-xxx-a`)
2. **External URL** - Works from anywhere (hostname like `dpg-xxx-a.oregon-postgres.render.com`)

The API is using the internal URL, which doesn't resolve.

## Solution: Use External Database URL

### Step 1: Get External Database URL

1. **Go to Render Dashboard** → **pbookspro-db** (your database)
2. **Go to "Info" tab**
3. **Find "External Database URL"** (NOT "Internal Database URL")
4. **Copy the full External Database URL**

It should look like:
```
postgresql://user:password@dpg-xxx-a.oregon-postgres.render.com:5432/dbname?sslmode=require
```

**Important:** The hostname should include the full domain (e.g., `.oregon-postgres.render.com`), not just `dpg-xxx-a`.

### Step 2: Update DATABASE_URL in Render

1. **Go to Render Dashboard** → **pbookspro-api** service
2. **Go to "Environment" tab**
3. **Find `DATABASE_URL`**
4. **Click to edit it**
5. **Replace with the External Database URL** you copied
6. **Save**

### Step 3: Restart API Service

After updating:

1. **Go to "Events" tab**
2. **Click "Manual Deploy"** → **"Deploy latest commit"**
3. **Or wait** - Render will auto-restart when env vars change

### Step 4: Verify Connection

After restart, check the logs:

1. **Go to "Logs" tab**
2. **Look for:** `✅ Connected to PostgreSQL database`
3. **If you see connection errors**, verify the URL format

## Why This Happens

The `fromDatabase` in `render.yaml` uses the internal connection string, which may not resolve correctly. Using the External Database URL ensures it works.

## After Fixing

Once the database connection works:
1. **Registration should work**
2. **Login should work**
3. **All API endpoints should work**

---

**The fix: Use the External Database URL from Render Dashboard instead of the internal one!**

