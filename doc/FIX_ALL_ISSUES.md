# Fix All Remaining Issues

I've fixed two issues:

## Issue 1: Double /api/api/ Path ✅ FIXED

Fixed the `lookup-tenant` endpoint in `components/auth/CloudLoginPage.tsx`:
- Changed: `/api/auth/lookup-tenant` → `/auth/lookup-tenant`

## Issue 2: Database Connection Error ⚠️ NEEDS MANUAL FIX

The database connection error `ENOTFOUND dpg-d5ced2h5pdvs73c8s4c0-a` means the API is using the internal database URL.

### Fix Database URL:

1. **Go to Render Dashboard** → **pbookspro-db** (database)
2. **Go to "Info" tab**
3. **Copy "External Database URL"** (full URL with domain)
4. **Go to Render Dashboard** → **pbookspro-api** → **Environment**
5. **Edit `DATABASE_URL`** → **Paste External Database URL**
6. **Save** → API will restart

## Deploy the Code Fix

```powershell
git add components/auth/CloudLoginPage.tsx
git commit -m "Fix lookup-tenant endpoint path"
git push
```

## After Both Fixes

1. **Wait for rebuild** (2-5 minutes)
2. **Clear browser cache** (or use Incognito)
3. **Try registration again** - should work!

---

**The database URL fix must be done manually in Render Dashboard - it can't be fixed in code!**

