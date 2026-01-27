# Alternative: Update CORS Without Dashboard

If you can't find the service in Render dashboard, update CORS via code.

## Method 1: Update render.yaml (Recommended)

### Step 1: Edit render.yaml

Open `render.yaml` and find the `CORS_ORIGIN` line:

```yaml
envVars:
  - key: CORS_ORIGIN
    value: https://pbookspro-client.onrender.com,https://pbookspro-admin.onrender.com
```

### Step 2: Add localhost URLs

Update it to include localhost:

```yaml
envVars:
  - key: CORS_ORIGIN
    value: https://pbookspro-client.onrender.com,https://pbookspro-admin.onrender.com,http://localhost:5173,http://localhost:5174
```

### Step 3: Commit and Push

```powershell
git add render.yaml
git commit -m "Update CORS to allow localhost for local testing"
git push origin main
```

### Step 4: Wait for Auto-Deploy

- Render will detect the change
- Automatically redeploy the API service
- Takes ~2-5 minutes
- Check deployment status in Render dashboard

---

## Method 2: Direct URL Access

If you know your API service URL, you can try accessing it directly:

1. **Get your API URL**
   - Should be something like: `https://pbookspro-api.onrender.com`
   - Or check your Render dashboard for the service URL

2. **Access Render Dashboard via Service URL**
   - Sometimes you can access service settings via URL pattern
   - Try: `https://dashboard.render.com/web/[service-name]`
   - Replace `[service-name]` with your actual service name

---

## Method 3: Render CLI (If Available)

If Render has a CLI tool:

```bash
# Install Render CLI (if available)
npm install -g render-cli

# Update environment variable
render env:set CORS_ORIGIN "https://pbookspro-client.onrender.com,https://pbookspro-admin.onrender.com,http://localhost:5173,http://localhost:5174" --service pbookspro-api
```

---

## Method 4: Skip CORS Update (Development Only)

If you just want to test quickly, you can temporarily disable CORS checking:

**⚠️ WARNING: Only for local development!**

1. **Run local server** instead of using Render API
2. **Set CORS in local server** to allow all origins
3. **Connect local frontend to local server**

See `LOCAL_TESTING_WITH_RENDER.md` - Scenario 2 for this approach.

---

## Quick Fix: Use Local Server

If you can't update CORS on Render right now:

### Step 1: Get Database URL from Render

1. Go to Render Dashboard
2. Click on your **Database** (not API service)
3. Go to **Connections** tab
4. Copy **External Database URL**

### Step 2: Run Local Server

Create `server/.env`:

```env
DATABASE_URL=your-render-database-url-here
JWT_SECRET=local-dev-secret
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
LICENSE_SECRET_SALT=PBOOKSPRO_SECURE_SALT_2024
```

### Step 3: Start Local Server

```powershell
cd server
npm run dev
```

### Step 4: Update Frontend .env

**Client `.env`:**
```env
VITE_API_URL=http://localhost:3000/api
```

**Admin `admin/.env`:**
```env
VITE_ADMIN_API_URL=http://localhost:3000/api/admin
```

### Step 5: Start Frontend

```powershell
# Terminal 1: Client
npm run dev

# Terminal 2: Admin
cd admin
npm run dev
```

This way you don't need to update CORS on Render!

---

## Recommended Approach

**Best option:** Update `render.yaml` and push to GitHub
- Permanent solution
- Works for all environments
- No dashboard navigation needed

**Quick option:** Use local server with Render database
- Immediate testing
- No CORS issues
- Full control

Choose the method that works best for you!

