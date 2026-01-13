# Custom Domain Migration Implementation Guide

This guide provides step-by-step instructions for migrating all services to the custom domain `pbookspro.com`.

## Domain Structure

- `www.pbookspro.com` → Marketing/landing website
- `www.app.pbookspro.com` → Client application
- `admin.pbookspro.com` → Admin portal
- `api.pbookspro.com` → API server

## Phase 1: Deploy Website on Render

### Step 1: Commit and Push render.yaml

The `render.yaml` file has been updated with the website service. Commit and push the changes:

```powershell
git add render.yaml
git commit -m "Add website service and update to custom domains"
git push origin main
```

### Step 2: Verify Website Deployment

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Navigate to **Services**
3. Find the `pbookspro-website` service (it should appear after pushing)
4. Wait for deployment to complete (usually 2-5 minutes)
5. Verify the website is accessible at: `https://pbookspro-website.onrender.com`
6. Test all pages:
   - Home page (index.html)
   - Features page
   - Pricing page
   - About page
   - Contact page
   - Blog page
7. Verify all assets (images, CSS, JavaScript) load correctly

### Step 3: Update API CORS to Include Website

1. Go to Render Dashboard → **pbookspro-api** service
2. Click on **Environment** tab
3. Find the `CORS_ORIGIN` environment variable
4. Ensure it includes: `https://pbookspro-website.onrender.com`
   - If not present, add it to the comma-separated list
5. Click **Save Changes** (service will automatically restart)

## Phase 2: Migrate to Custom Domains

### Step 1: Configure DNS Records

At your domain registrar (where `pbookspro.com` is registered), add the following CNAME records:

#### CNAME Records to Add:

1. **For Website:**
   - **Type**: CNAME
   - **Name/Host**: `www`
   - **Value/Target**: `pbookspro-website.onrender.com`
   - **TTL**: 3600 (or default)

2. **For Client App:**
   - **Type**: CNAME
   - **Name/Host**: `www.app` (or create `app` first, then `www` under it)
   - **Value/Target**: `pbookspro-client.onrender.com`
   - **TTL**: 3600 (or default)
   
   **Note**: Some DNS providers require creating the `app` subdomain first:
   - First create: `app` → `pbookspro-client.onrender.com`
   - Then create: `www.app` → `pbookspro-client.onrender.com`
   
   Or check if your provider supports nested subdomains directly.

3. **For Admin App:**
   - **Type**: CNAME
   - **Name/Host**: `admin`
   - **Value/Target**: `pbookspro-admin.onrender.com`
   - **TTL**: 3600 (or default)

4. **For API Server:**
   - **Type**: CNAME
   - **Name/Host**: `api`
   - **Value/Target**: `pbookspro-api.onrender.com`
   - **TTL**: 3600 (or default)

#### Verify DNS Propagation

After adding DNS records, verify they're propagating:

```powershell
# Check DNS resolution (wait a few minutes after adding records)
nslookup www.pbookspro.com
nslookup www.app.pbookspro.com
nslookup admin.pbookspro.com
nslookup api.pbookspro.com
```

Or use online tools:
- https://dnschecker.org
- https://www.whatsmydns.net

**Note**: DNS propagation can take 24-48 hours, but often completes within minutes to a few hours.

### Step 2: Add Custom Domains in Render Dashboard

After DNS records are configured and propagated, add custom domains in Render:

#### 2.1: Website Service

1. Go to Render Dashboard → **pbookspro-website** service
2. Click **Settings** tab
3. Scroll to **Custom Domains** section
4. Click **Add Custom Domain**
5. Enter: `www.pbookspro.com`
6. Click **Save**
7. Render will automatically verify DNS
8. Wait for verification status to show "Verified" (green checkmark)
9. SSL certificate will be auto-provisioned (may take a few minutes to hours)

#### 2.2: Client App

1. Go to Render Dashboard → **pbookspro-client** service
2. Click **Settings** tab
3. Scroll to **Custom Domains** section
4. Click **Add Custom Domain**
5. Enter: `www.app.pbookspro.com`
6. Click **Save**
7. Wait for DNS verification
8. Wait for SSL certificate provisioning

#### 2.3: Admin App

1. Go to Render Dashboard → **pbookspro-admin** service
2. Click **Settings** tab
3. Scroll to **Custom Domains** section
4. Click **Add Custom Domain**
5. Enter: `admin.pbookspro.com`
6. Click **Save**
7. Wait for DNS verification
8. Wait for SSL certificate provisioning

#### 2.4: API Server

1. Go to Render Dashboard → **pbookspro-api** service
2. Click **Settings** tab
3. Scroll to **Custom Domains** section
4. Click **Add Custom Domain**
5. Enter: `api.pbookspro.com`
6. Click **Save**
7. Wait for DNS verification
8. Wait for SSL certificate provisioning

### Step 3: Update Environment Variables in Render Dashboard

After all custom domains are verified, update environment variables:

#### 3.1: API Server (pbookspro-api)

1. Go to **pbookspro-api** service → **Environment** tab
2. Update the following environment variables:

   - **CORS_ORIGIN**: 
     ```
     https://www.pbookspro.com,https://www.app.pbookspro.com,https://admin.pbookspro.com,https://pbookspro-client.onrender.com,https://pbookspro-client-8sn6.onrender.com,https://pbookspro-admin.onrender.com,https://pbookspro-admin-8sn6.onrender.com,https://pbookspro-website.onrender.com,http://localhost:5173,http://localhost:5174
     ```
     (Keep old Render URLs during transition for safety)

   - **API_URL**: `https://api.pbookspro.com`
   - **SERVER_URL**: `https://api.pbookspro.com`
   - **CLIENT_URL**: `https://www.app.pbookspro.com`

3. Click **Save Changes** (service will automatically restart)

#### 3.2: Client App (pbookspro-client)

1. Go to **pbookspro-client** service → **Environment** tab
2. Update:
   - **VITE_API_URL**: `https://api.pbookspro.com/api`
3. Click **Save Changes**
4. **IMPORTANT**: Go to **Events** tab (or main page)
5. Click **Manual Deploy** → **Deploy latest commit**
6. Wait for rebuild to complete (2-5 minutes)
   - This is required because Vite embeds environment variables at build time

#### 3.3: Admin App (pbookspro-admin)

1. Go to **pbookspro-admin** service → **Environment** tab
2. Update:
   - **VITE_ADMIN_API_URL**: `https://api.pbookspro.com/api/admin`
3. Click **Save Changes**
4. **IMPORTANT**: Go to **Events** tab (or main page)
5. Click **Manual Deploy** → **Deploy latest commit**
6. Wait for rebuild to complete (2-5 minutes)

### Step 4: Verification and Testing

Test all services on their new custom domains:

#### 4.1: Website Verification

1. Visit `https://www.pbookspro.com`
2. Verify:
   - ✅ Page loads correctly
   - ✅ SSL certificate is valid (lock icon in browser)
   - ✅ All pages accessible (features, pricing, about, contact, blog)
   - ✅ All images and assets load
   - ✅ Navigation works
   - ✅ Forms work (if applicable)

#### 4.2: Client App Verification

1. Visit `https://www.app.pbookspro.com`
2. Open browser DevTools (F12) → **Network** tab
3. Try to login or perform an action
4. Verify:
   - ✅ Page loads correctly
   - ✅ SSL certificate is valid
   - ✅ API calls go to `api.pbookspro.com` (check Network tab)
   - ✅ No CORS errors in console
   - ✅ Login works
   - ✅ Core features work

#### 4.3: Admin App Verification

1. Visit `https://admin.pbookspro.com`
2. Open browser DevTools (F12) → **Network** tab
3. Try to login
4. Verify:
   - ✅ Page loads correctly
   - ✅ SSL certificate is valid
   - ✅ API calls go to `api.pbookspro.com/api/admin` (check Network tab)
   - ✅ No CORS errors in console
   - ✅ Admin login works
   - ✅ Admin features work

#### 4.4: API Server Verification

1. Test API endpoint:
   - Visit: `https://api.pbookspro.com/api/health` (or similar endpoint)
   - Or use curl: `curl https://api.pbookspro.com/api/health`
2. Verify:
   - ✅ API responds correctly
   - ✅ SSL certificate is valid
   - ✅ CORS headers allow requests from new domains

#### 4.5: End-to-End Testing

1. Test complete user workflows:
   - User registration/login
   - Data creation/editing
   - Reports generation
   - All major features
2. Test on different browsers:
   - Chrome
   - Firefox
   - Safari
   - Edge
3. Check for errors:
   - Browser console (F12)
   - Network tab for failed requests
   - API logs in Render Dashboard

### Step 5: Cleanup (Optional - After Full Verification)

Once everything is verified and working for at least 24-48 hours:

1. **Optional**: Remove old Render subdomains from `CORS_ORIGIN` in API server
   - Keep them for a few days as backup, then remove:
     - `https://pbookspro-client.onrender.com`
     - `https://pbookspro-client-8sn6.onrender.com`
     - `https://pbookspro-admin.onrender.com`
     - `https://pbookspro-admin-8sn6.onrender.com`
     - `https://pbookspro-website.onrender.com`

2. **Optional**: Update any hardcoded URLs in website HTML files
   - Check `website/Website/*.html` files
   - Update any links that reference old Render URLs
   - Update links to client app and admin portal if needed

3. **Optional**: Update documentation
   - Update any documentation that references old URLs
   - Update README files if needed

## Troubleshooting

### DNS Not Resolving

**Problem**: Custom domain shows "DNS not verified" in Render

**Solutions**:
- Wait longer for DNS propagation (can take up to 48 hours)
- Verify DNS records are correct at your registrar
- Check DNS propagation using online tools (dnschecker.org)
- Ensure CNAME records point to correct Render subdomains
- For `www.app.pbookspro.com`, ensure `app` subdomain is created first

### SSL Certificate Not Provisioned

**Problem**: HTTPS not working or certificate error

**Solutions**:
- Wait for SSL provisioning (can take a few hours after DNS verification)
- Ensure DNS is fully propagated
- Check Render Dashboard → Service → Custom Domains for SSL status
- Try accessing the domain again after a few hours

### CORS Errors

**Problem**: Browser console shows CORS errors

**Solutions**:
- Verify `CORS_ORIGIN` includes the new domain
- Ensure API server was restarted after updating CORS_ORIGIN
- Check that the domain in CORS_ORIGIN matches exactly (including https://)
- Clear browser cache and try again

### Frontend Still Using Old API URL

**Problem**: Client/Admin apps still calling old Render API URL

**Solutions**:
- Verify environment variable is set correctly in Render Dashboard
- **Trigger manual rebuild** of the frontend service (required for Vite apps)
- Check build logs to ensure environment variable was used
- Clear browser cache

### Website Not Loading

**Problem**: Website shows 404 or doesn't load

**Solutions**:
- Verify `staticPublishPath` is correct: `./website/Website`
- Check that website files exist in `website/Website/` directory
- Verify service is deployed and running
- Check Render logs for errors

## Rollback Plan

If critical issues occur:

1. **Immediate Rollback**:
   - Go to Render Dashboard → Service → Environment
   - Revert environment variables to old Render URLs
   - Remove custom domains from Render services
   - Trigger manual rebuilds for frontend apps

2. **DNS Rollback**:
   - Remove or update DNS CNAME records at domain registrar
   - Wait for DNS propagation

3. **Code Rollback** (if needed):
   ```powershell
   git revert HEAD
   git push origin main
   ```

## Success Checklist

- [ ] Website deployed and accessible at `pbookspro-website.onrender.com`
- [ ] DNS records configured and propagated
- [ ] All custom domains added in Render Dashboard
- [ ] All custom domains verified in Render
- [ ] SSL certificates provisioned for all domains
- [ ] Environment variables updated in Render Dashboard
- [ ] Frontend apps rebuilt with new API URLs
- [ ] Website accessible at `https://www.pbookspro.com`
- [ ] Client app accessible at `https://www.app.pbookspro.com`
- [ ] Admin app accessible at `https://admin.pbookspro.com`
- [ ] API server accessible at `https://api.pbookspro.com`
- [ ] All services tested and working
- [ ] No CORS errors
- [ ] All functionality verified

## Next Steps

After successful migration:

1. Monitor services for 24-48 hours
2. Update any external documentation or links
3. Consider setting up monitoring/alerting for the new domains
4. Update any marketing materials with new URLs
5. Consider setting up redirects from old Render URLs (if desired)
