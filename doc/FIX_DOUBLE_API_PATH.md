# Fix Double /api/api/ Path Issue

I found the problem! The API endpoints were using `/api/auth/register-tenant` but the base URL already includes `/api`, causing:
- `https://pbookspro-api.onrender.com/api` + `/api/auth/register-tenant` 
- = `https://pbookspro-api.onrender.com/api/api/auth/register-tenant` ❌

## What I Fixed

Updated all endpoints in `context/AuthContext.tsx` to remove the `/api/` prefix:
- `/api/auth/login` → `/auth/login`
- `/api/auth/register-tenant` → `/auth/register-tenant`
- `/api/tenants/license-status` → `/tenants/license-status`
- `/api/tenants/me` → `/tenants/me`
- `/api/tenants/activate-license` → `/tenants/activate-license`

## Also Fixed CORS

Updated `render.yaml` to include the actual client app URL:
- Added: `https://pbookspro-client-8sn6.onrender.com` to CORS_ORIGIN

## Deploy the Fix

```powershell
git add context/AuthContext.tsx render.yaml
git commit -m "Fix double /api/ path and add client URL to CORS"
git push
```

## After Deployment

1. **Wait for rebuild** (2-5 minutes)
2. **Clear browser cache** (or use Incognito)
3. **Try registration again** - should work!

The URLs will now be:
- ✅ `https://pbookspro-api.onrender.com/api/auth/register-tenant`
- ❌ NOT `https://pbookspro-api.onrender.com/api/api/auth/register-tenant`

---

**This should fix both the double /api/ path and the CORS error!**

