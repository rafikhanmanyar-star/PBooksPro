# Fixed render.yaml - Database Setup

## ✅ What I Fixed

1. **Removed `type: pspg`** - Render Blueprint doesn't support this
2. **Updated DATABASE_URL** - Now uses `fromDatabase` to reference a manually created database

## 📋 Next Steps

### Step 1: Create Database Manually (Required)

Render Blueprint can't create databases automatically. You must create it first:

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Click "New +" → "PostgreSQL"**
3. **Configure:**
   - **Name**: `pbookspro-database` (must match exactly)
   - **Database**: `pbookspro`
   - **User**: `pbookspro_user` (or auto-generated)
   - **Region**: Choose closest
   - **Plan**: Starter (or Free for testing)
4. **Click "Create Database"**

### Step 2: Deploy Services

After database is created:

1. **Push updated render.yaml**:
   ```powershell
   git add render.yaml
   git commit -m "Fix render.yaml - remove pspg type, use fromDatabase"
   git push
   ```

2. **Deploy via Blueprint**:
   - Render Dashboard → Blueprints
   - Connect your GitHub repository
   - Render will detect `render.yaml`
   - It will create the 3 services (API, Client, Admin)
   - The API service will automatically link to `pbookspro-database`

### Step 3: Verify

After deployment:

1. **Check API Service**:
   - Should show DATABASE_URL is set
   - Logs should show: "✅ Connected to PostgreSQL database"

2. **Test Health**:
   ```bash
   curl https://pbookspro-api.onrender.com/health
   ```

## 🎯 Current render.yaml Structure

Your `render.yaml` now defines:
- ✅ API Server (web service)
- ✅ Client App (static site)
- ✅ Admin App (static site)
- ⚠️ Database (must be created manually first)

The `fromDatabase` reference will automatically connect the API to the database once both exist.

## 📝 Important Notes

- **Database name must match**: `pbookspro-database` (exactly as in render.yaml)
- **Create database first** before deploying Blueprint
- **Or** deploy Blueprint first, then create database, then update service environment

## 🔄 Alternative: Manual Environment Setup

If Blueprint doesn't link the database automatically:

1. Go to API Service → Environment tab
2. Add `DATABASE_URL` manually
3. Use "Link Database" option
4. Select `pbookspro-database`
5. Save

The `fromDatabase` syntax should work automatically, but this is a fallback.

---

**Your render.yaml is now fixed and ready to deploy!** 🚀

