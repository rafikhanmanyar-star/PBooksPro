# Verify Render Branch Settings

## Issue
Production API server was deployed instead of staging API server.

## Current Configuration in render.yaml

✅ **Production API Server** (`pbookspro-api`):
- Branch: `main`
- NODE_ENV: `production`
- Deploys when: `main` branch is pushed

✅ **Staging API Server** (`pbookspro-api-staging`):
- Branch: `staging`
- NODE_ENV: `staging`
- Deploys when: `staging` branch is pushed

## Verification Steps

### Step 1: Check Render Dashboard Settings

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Navigate to your services

#### For Production API Server (`pbookspro-api`):
1. Click on `pbookspro-api` service
2. Go to **Settings** tab
3. Check **Branch** field - should be: `main`
4. Check **Environment** variables - `NODE_ENV` should be: `production`

#### For Staging API Server (`pbookspro-api-staging`):
1. Click on `pbookspro-api-staging` service
2. Go to **Settings** tab
3. Check **Branch** field - should be: `staging`
4. Check **Environment** variables - `NODE_ENV` should be: `staging`

### Step 2: Fix if Branch is Wrong

If the branch setting in Render Dashboard doesn't match:

1. **For Production API Server:**
   - Settings → Branch → Change to: `main`
   - Save changes

2. **For Staging API Server:**
   - Settings → Branch → Change to: `staging`
   - Save changes

### Step 3: Re-apply Blueprint (Recommended)

If services were created manually, they might not match the YAML:

1. Go to **Blueprints** in Render Dashboard
2. Find your blueprint
3. Click **Apply** or **Update**
4. This will sync all services with `render.yaml`

## Expected Behavior

### When you push to `main` branch:
- ✅ `pbookspro-api` (production) should deploy
- ❌ `pbookspro-api-staging` should NOT deploy

### When you push to `staging` branch:
- ✅ `pbookspro-api-staging` should deploy
- ❌ `pbookspro-api` (production) should NOT deploy

## Troubleshooting

### If production deploys when pushing to staging:

1. **Check Render Dashboard:**
   - Verify `pbookspro-api` branch is set to `main` (not `staging`)
   - Verify `pbookspro-api-staging` branch is set to `staging`

2. **Check Git branches:**
   ```bash
   git branch -a
   ```
   - Ensure you're pushing to the correct branch

3. **Check Render logs:**
   - Look at deployment logs to see which branch triggered the deployment
   - Should show: "Deploying from branch: staging" or "Deploying from branch: main"

### If both deploy:

This is normal if:
- You pushed to `main` → Production deploys
- You pushed to `staging` → Staging deploys
- You pushed to both → Both deploy

This is NOT normal if:
- Pushing to `staging` causes production to deploy → Check production service branch setting

## Quick Fix

If production API server is deploying from wrong branch:

1. Go to Render Dashboard
2. Click `pbookspro-api` service
3. Settings → Branch → Change to: `main`
4. Save

If staging API server is deploying from wrong branch:

1. Go to Render Dashboard
2. Click `pbookspro-api-staging` service
3. Settings → Branch → Change to: `staging`
4. Save

## Verification Command

After fixing, verify by checking the service settings in Render Dashboard. The branch should match:
- Production: `main`
- Staging: `staging`
