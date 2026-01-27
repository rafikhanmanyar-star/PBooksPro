# Manual Staging Services Setup in Render

## Important: Render doesn't automatically create services from render.yaml

Render.com requires you to either:
1. **Apply a Blueprint** (uses render.yaml) - Recommended for new setups
2. **Create services manually** - Quick option for adding staging services

Since you already have production services, here's how to add staging services:

---

## Option 1: Create Blueprint from render.yaml (Recommended)

### Step 1: Create New Blueprint

1. Go to Render Dashboard: https://dashboard.render.com
2. Click **"New +"** button (top right)
3. Select **"Blueprint"**
4. Connect your GitHub repository:
   - Select: `rafikhanmanyar-star/PBooksPro`
   - Render will detect `render.yaml`
5. Click **"Apply"**

**Result**: Render will create ALL services defined in render.yaml (both production and staging)

### Step 2: Configure Branch for Each Service

After Blueprint is applied, you'll need to configure branches:

1. For **staging services** (`-staging` suffix):
   - Go to each service settings
   - Set **Branch** to `staging`
   - Save

2. For **production services** (no suffix):
   - Go to each service settings
   - Set **Branch** to `main`
   - Save

---

## Option 2: Manually Create Staging Services

If you prefer to create staging services manually (without Blueprint):

### Step 1: Create Staging Database

1. Go to Render Dashboard
2. Click **"New +"** → **"PostgreSQL"**
3. Configure:
   - **Name**: `pbookspro-db-staging`
   - **Database**: `pbookspro_staging`
   - **User**: `pbookspro_staging`
   - **Plan**: Starter (Free tier)
   - **Region**: Same as production (recommended)
4. Click **"Create Database"**
5. **Important**: Copy the **External Database URL** (we'll need it)

### Step 2: Create Staging API Server

1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repository: `rafikhanmanyar-star/PBooksPro`
3. Configure:
   - **Name**: `pbookspro-api-staging`
   - **Region**: Same as production
   - **Branch**: `staging` ⚠️ **IMPORTANT**
   - **Root Directory**: Leave blank (root)
   - **Runtime**: Node
   - **Build Command**: `cd server && npm install --include=dev && npm run build`
   - **Start Command**: `cd server && npm start`
   - **Plan**: Starter (Free tier)
4. Click **"Advanced"** and add Environment Variables:
   ```
   DATABASE_URL = (from pbookspro-db-staging External URL)
   JWT_SECRET = (Generate random string or let Render generate)
   LICENSE_SECRET_SALT = PBOOKSPRO_SECURE_SALT_2024_STAGING
   NODE_ENV = staging
   PORT = 3000
   CORS_ORIGIN = https://pbookspro-client-staging.onrender.com,https://pbookspro-admin-staging.onrender.com,http://localhost:5173,http://localhost:5174
   API_URL = https://pbookspro-api-staging.onrender.com
   SERVER_URL = https://pbookspro-api-staging.onrender.com
   CLIENT_URL = https://pbookspro-client-staging.onrender.com
   ```
5. Click **"Create Web Service"**

### Step 3: Create Staging Client

1. Click **"New +"** → **"Static Site"**
2. Connect your GitHub repository: `rafikhanmanyar-star/PBooksPro`
3. Configure:
   - **Name**: `pbookspro-client-staging`
   - **Branch**: `staging` ⚠️ **IMPORTANT**
   - **Root Directory**: Leave blank (root)
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
4. Add Environment Variable:
   ```
   VITE_API_URL = https://pbookspro-api-staging.onrender.com/api
   ```
5. Click **"Create Static Site"**

### Step 4: Create Staging Admin

1. Click **"New +"** → **"Static Site"**
2. Connect your GitHub repository: `rafikhanmanyar-star/PBooksPro`
3. Configure:
   - **Name**: `pbookspro-admin-staging`
   - **Branch**: `staging` ⚠️ **IMPORTANT**
   - **Root Directory**: Leave blank (root)
   - **Build Command**: `cd admin && npm install && npm run build`
   - **Publish Directory**: `admin/dist`
4. Add Environment Variable:
   ```
   VITE_ADMIN_API_URL = https://pbookspro-api-staging.onrender.com/api/admin
   ```
5. Click **"Create Static Site"**

---

## After Creating Services

### Verify Branch Settings

For each staging service (`-staging`):
1. Go to service settings
2. Click **"Settings"** tab
3. Verify **"Branch"** is set to `staging`
4. If not, change it and save

### Trigger First Deployment

1. For each staging service:
   - Go to the service
   - Click **"Manual Deploy"**
   - Select **"Deploy latest commit"**
   - Or push a new commit to `staging` branch (auto-deploy)

### Check Service URLs

After deployment completes, you'll see URLs like:
- API: `https://pbookspro-api-staging.onrender.com`
- Client: `https://pbookspro-client-staging.onrender.com`
- Admin: `https://pbookspro-admin-staging.onrender.com`

---

## Troubleshooting

### Services still deploying from wrong branch

- **Check**: Service Settings → Branch = `staging`
- **Check**: Auto-deploy is enabled
- **Check**: Latest commit is on `staging` branch

### Database connection errors

- **Check**: DATABASE_URL uses **External Database URL** (not Internal)
- **Check**: Database is in same region as API service
- **Check**: Database service is running (not sleeping)

### Build errors

- **Check**: Build Command is correct
- **Check**: Root Directory is correct
- **Check**: Service logs for specific errors

### CORS errors

- **Check**: CORS_ORIGIN includes staging URLs
- **Check**: URLs match exactly (no trailing slashes)

---

## Quick Checklist

- [ ] Staging database created (`pbookspro-db-staging`)
- [ ] Staging API service created (`pbookspro-api-staging`) with branch: staging
- [ ] Staging client service created (`pbookspro-client-staging`) with branch: staging
- [ ] Staging admin service created (`pbookspro-admin-staging`) with branch: staging
- [ ] All environment variables configured
- [ ] All services set to branch: staging
- [ ] First deployment triggered
- [ ] All services show green (deployed)

---

## Recommendation

**Use Option 1 (Blueprint)** if you want Render to manage all services from `render.yaml`. This is easier for long-term maintenance.

**Use Option 2 (Manual)** if you want more control or have specific requirements not in render.yaml.
