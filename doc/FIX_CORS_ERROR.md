# Fix CORS Error

The CORS error occurs because the API server needs to properly handle preflight (OPTIONS) requests and return valid CORS headers.

## What I Fixed

1. **Updated CORS configuration** in `server/api/index.ts`:
   - Added proper origin validation
   - Added explicit methods: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`
   - Added allowed headers: `Content-Type`, `Authorization`, `X-Tenant-ID`
   - Added exposed headers
   - Set maxAge for preflight cache (24 hours)
   - Added debug logging to help troubleshoot

2. **Updated `render.yaml`**:
   - Added your actual admin portal URL to CORS_ORIGIN: `https://pbookspro-admin-8sn6.onrender.com`

## Next Steps

### Step 1: Deploy the Updated API Server

The CORS fix is in the code, but you need to deploy it:

**Option A: Push to GitHub (Auto-deploy)**
```powershell
git add server/api/index.ts render.yaml
git commit -m "Fix CORS configuration for admin portal"
git push
```

Render will automatically rebuild the API server.

**Option B: Manual Rebuild in Render**
1. Go to Render Dashboard → **pbookspro-api** service
2. Click **"Manual Deploy"** → **"Deploy latest commit"**

### Step 2: Verify CORS Configuration

After deployment, check the API server logs:

1. Go to Render Dashboard → **pbookspro-api** → **Logs**
2. Look for: `🌐 CORS Origins: [...]`
3. Should show all allowed origins including your admin portal

### Step 3: Test the Admin Portal

1. Go to: `https://pbookspro-admin-8sn6.onrender.com`
2. Open DevTools (F12) → **Network** tab
3. Try to login
4. Check the preflight (OPTIONS) request:
   - Should return `200 OK`
   - Should have headers:
     - `Access-Control-Allow-Origin: https://pbookspro-admin-8sn6.onrender.com`
     - `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS`
     - `Access-Control-Allow-Headers: Content-Type, Authorization, X-Tenant-ID`
     - `Access-Control-Allow-Credentials: true`

### Step 4: Verify Environment Variable

Make sure `CORS_ORIGIN` is set correctly in Render:

1. Go to Render Dashboard → **pbookspro-api** → **Environment**
2. Check `CORS_ORIGIN` value:
   ```
   https://pbookspro-client.onrender.com,https://pbookspro-admin.onrender.com,https://pbookspro-admin-8sn6.onrender.com,http://localhost:5173,http://localhost:5174
   ```

If it's missing or wrong, add/update it manually.

## What Changed

**Before:**
```typescript
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  credentials: true
}));
```

**After:**
```typescript
const corsOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : ['*'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isAllowed = corsOrigins.includes('*') || corsOrigins.includes(origin);
    callback(isAllowed ? null : new Error(`Not allowed by CORS`), isAllowed);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
}));
```

## Debugging

If CORS still fails after deployment:

1. **Check API logs** for CORS messages:
   - `✅ CORS: Allowing origin: ...`
   - `❌ CORS: Blocking origin: ...`

2. **Check browser console** for the exact error message

3. **Test API directly:**
   ```bash
   curl -X OPTIONS https://pbookspro-api.onrender.com/api/admin/auth/login \
     -H "Origin: https://pbookspro-admin-8sn6.onrender.com" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -v
   ```

   Should return CORS headers in the response.

---

**After deploying, the CORS error should be resolved!**

