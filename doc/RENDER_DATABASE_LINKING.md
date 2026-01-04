# Linking Database to API Service in Render

## The Issue

Render Blueprint found `render.yaml` but the database `pbookspro-database` doesn't exist yet. This is expected - you need to create the database first.

## Solution: Two-Step Process

### Step 1: Create Database First (Required)

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Click "New +" → "PostgreSQL"**
3. **Configure:**
   - **Name**: `pbookspro-database` (must match exactly)
   - **Database**: `pbookspro`
   - **User**: `pbookspro_user` (or auto-generated)
   - **Region**: Choose closest to your users
   - **PostgreSQL Version**: 15 or later
   - **Plan**: Starter (or Free for testing)
4. **Click "Create Database"**
5. **Wait for database to be created** (~1-2 minutes)

### Step 2: Link Database to API Service

After database is created, you have two options:

#### Option A: Link via Dashboard (Easiest)

1. **Go to API Service**
   - Render Dashboard → Services → `pbookspro-api`

2. **Go to Environment Tab**
   - Click "Environment" tab

3. **Link Database**
   - Click "Add Environment Variable"
   - **Key**: `DATABASE_URL`
   - Click "Link Database" or "Link Resource"
   - Select: `pbookspro-database`
   - Property: `Connection String` or `Internal Database URL`
   - Click "Save"

4. **Service will restart automatically**
   - Wait ~30 seconds for restart
   - Check logs to verify connection

#### Option B: Update render.yaml (After Database Created)

1. **Edit `render.yaml`**
   - Uncomment the DATABASE_URL section:
   ```yaml
   envVars:
     - key: DATABASE_URL
       fromDatabase:
         name: pbookspro-database
         property: connectionString
   ```

2. **Commit and Push**
   ```powershell
   git add render.yaml
   git commit -m "Link database to API service"
   git push
   ```

3. **Render will auto-update** the service

## Current render.yaml Status

The `render.yaml` currently has DATABASE_URL commented out. This is intentional so you can:

1. **Deploy services first** (API, Client, Admin)
2. **Create database manually**
3. **Then link them together**

## Recommended Workflow

### Method 1: Create Database First (Recommended)

1. ✅ Create database in Render Dashboard
2. ✅ Deploy Blueprint (services will be created)
3. ✅ Link database via Environment tab
4. ✅ Service restarts and connects

### Method 2: Deploy Services First

1. ✅ Deploy Blueprint (services created, but API won't have DATABASE_URL)
2. ✅ Create database manually
3. ✅ Link database via Environment tab
4. ✅ Service restarts and connects

## Verify Connection

After linking:

1. **Check API Service Logs**
   - Go to API service → Logs tab
   - Should see: "✅ Connected to PostgreSQL database"

2. **Test Health Endpoint**
   ```bash
   curl https://pbookspro-api.onrender.com/health
   ```
   Should show database as "connected"

3. **Test API**
   - Try admin login: `Admin` / `admin123`
   - Should work if database is connected

## Troubleshooting

### "Database not found" error
- Verify database name matches exactly: `pbookspro-database`
- Check database is fully created (not still provisioning)
- Ensure you're linking the correct database

### "Connection refused" error
- Check database is not paused (free tier pauses after inactivity)
- Verify you're using Internal Database URL (for Render services)
- Check database region matches service region

### Service won't start
- Check DATABASE_URL is set in Environment tab
- Verify database is accessible
- Check service logs for specific errors

## Quick Checklist

- [ ] Database created in Render Dashboard
- [ ] Database name: `pbookspro-database`
- [ ] API service deployed
- [ ] DATABASE_URL linked in Environment tab
- [ ] Service restarted
- [ ] Logs show database connection
- [ ] Health endpoint responds
- [ ] Can login to admin portal

---

**Once database is created and linked, your API will be fully functional!** 🚀

