# Rebuild Admin Portal to Fix API URL

The admin portal is using `localhost` because it was built without the `VITE_ADMIN_API_URL` environment variable. Vite embeds environment variables at **build time**, so we need to rebuild.

## Quick Fix: Trigger Rebuild

### Option 1: Manual Rebuild in Render (Fastest)

1. **Go to Render Dashboard**
   - https://dashboard.render.com
   - Click on **pbookspro-admin** service

2. **Trigger Manual Rebuild**
   - Click **"Manual Deploy"** button
   - Select **"Deploy latest commit"**
   - This will rebuild with the environment variable from `render.yaml`

3. **Wait for Build**
   - Watch the build logs
   - Should complete in 2-5 minutes

4. **Test Login**
   - Go to: `https://pbookspro-admin-8sn6.onrender.com`
   - Should now connect to Render API

### Option 2: Push a Commit (Automatic)

If you make any change and push, Render will auto-rebuild:

```powershell
# Make a small change to trigger rebuild
git add render.yaml
git commit -m "Update CORS to include actual admin portal URL"
git push
```

Render will automatically rebuild the admin portal.

## Verify Environment Variable

Before rebuilding, verify it's set correctly:

1. **Go to Render Dashboard** → **pbookspro-admin** service
2. **Go to Environment tab**
3. **Check `VITE_ADMIN_API_URL`** is set to:
   ```
   https://pbookspro-api.onrender.com/api/admin
   ```

If it's missing or wrong:
- Add/update it manually
- Or it will be set from `render.yaml` on next deploy

## After Rebuild: Verify

1. **Open admin portal:** `https://pbookspro-admin-8sn6.onrender.com`
2. **Open DevTools** (F12) → **Console**
3. **Try to login**
4. **Check Network tab** - should show requests to:
   - ✅ `https://pbookspro-api.onrender.com/api/admin/auth/login`
   - ❌ NOT `http://localhost:3000/api/admin/auth/login`

## Why This Happens

- **Vite embeds env vars at build time** (not runtime)
- If `VITE_ADMIN_API_URL` wasn't set during build, it defaults to `localhost`
- Changing env vars after build doesn't help - need to rebuild
- The `render.yaml` has the correct value, so rebuilding will fix it

---

**Recommended:** Use Option 1 (Manual Rebuild) - it's the fastest way to fix this!

