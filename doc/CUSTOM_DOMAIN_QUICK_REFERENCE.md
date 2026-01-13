# Custom Domain Migration - Quick Reference

## What Was Done

✅ **render.yaml Updated**:
- Added `pbookspro-website` service (static site)
- Updated all environment variables to use custom domains:
  - API: `api.pbookspro.com`
  - Client: `www.app.pbookspro.com`
  - Admin: `admin.pbookspro.com`
  - Website: `www.pbookspro.com`

## Next Steps (Manual)

### 1. Commit and Push
```powershell
git add render.yaml
git commit -m "Add website service and update to custom domains"
git push origin main
```

### 2. Configure DNS (at domain registrar)
Add these CNAME records:
- `www` → `pbookspro-website.onrender.com`
- `www.app` → `pbookspro-client.onrender.com` (or create `app` first)
- `admin` → `pbookspro-admin.onrender.com`
- `api` → `pbookspro-api.onrender.com`

### 3. Add Custom Domains in Render Dashboard
For each service, go to Settings → Custom Domains:
- `pbookspro-website` → Add `www.pbookspro.com`
- `pbookspro-client` → Add `www.app.pbookspro.com`
- `pbookspro-admin` → Add `admin.pbookspro.com`
- `pbookspro-api` → Add `api.pbookspro.com`

### 4. Update Environment Variables in Render Dashboard
- **API Server**: Update CORS_ORIGIN, API_URL, SERVER_URL, CLIENT_URL
- **Client App**: Update VITE_API_URL, then **Manual Deploy** (rebuild required)
- **Admin App**: Update VITE_ADMIN_API_URL, then **Manual Deploy** (rebuild required)

### 5. Verify Everything Works
- Test all domains
- Check SSL certificates
- Verify API connectivity
- Test all functionality

## Full Guide

See [CUSTOM_DOMAIN_MIGRATION_GUIDE.md](CUSTOM_DOMAIN_MIGRATION_GUIDE.md) for detailed step-by-step instructions.
