# Render Database Setup - Manual Creation Required

Render Blueprint doesn't support defining PostgreSQL databases directly in `render.yaml`. You need to create the database manually first.

## Step 1: Create PostgreSQL Database Manually

1. **Go to Render Dashboard**
   - Visit: https://dashboard.render.com
   - Sign in

2. **Create New PostgreSQL Database**
   - Click "New +" → "PostgreSQL"
   - Configure:
     - **Name**: `pbookspro-database`
     - **Database**: `pbookspro`
     - **User**: `pbookspro_user` (or auto-generated)
     - **Region**: Choose closest to your users
     - **PostgreSQL Version**: 15 or later
     - **Plan**: Starter (or Free for testing)
   - Click "Create Database"

3. **Note the Connection Details**
   - After creation, go to "Connections" tab
   - Copy the **Internal Database URL** (for Render services)
   - Keep this for Step 2

## Step 2: Update API Service Environment

After creating the database, connect it to your API service:

### Option A: Using Blueprint (After Database Created)

1. **Update render.yaml** to reference the database:
   ```yaml
   envVars:
     - key: DATABASE_URL
       fromDatabase:
         name: pbookspro-database
         property: connectionString
   ```

2. **Push to GitHub**:
   ```powershell
   git add render.yaml
   git commit -m "Update render.yaml to reference database"
   git push
   ```

3. **Render will auto-update** the service

### Option B: Manual Setup in Dashboard

1. **Go to API Service**
   - Render Dashboard → Services → `pbookspro-api`

2. **Go to Environment Tab**
   - Click "Environment" tab

3. **Add DATABASE_URL**
   - Click "Add Environment Variable"
   - **Key**: `DATABASE_URL`
   - **Value**: Use "Link Database" option
   - Select: `pbookspro-database`
   - Property: `Connection String`
   - Click "Save"

## Step 3: Verify Connection

After setting up:

1. **Check API Service Logs**
   - Go to API service → Logs tab
   - Should see: "✅ Connected to PostgreSQL database"

2. **Test Health Endpoint**
   ```bash
   curl https://pbookspro-api.onrender.com/health
   ```
   Should show database as "connected"

## Alternative: Update render.yaml After Database Creation

Once you've created the database manually, you can update `render.yaml`:

```yaml
services:
  - type: web
    name: pbookspro-api
    env: node
    plan: starter
    buildCommand: cd server && npm install && npm run build
    startCommand: cd server && npm start
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: pbookspro-database  # Must match the database name you created
          property: connectionString
      # ... other env vars
```

Then push to GitHub and Render will link them automatically.

## Quick Summary

1. ✅ Create database manually in Render Dashboard
2. ✅ Link database to API service (via Environment tab or render.yaml)
3. ✅ Verify connection in logs

The database will be created once, then all services can reference it using `fromDatabase`.

