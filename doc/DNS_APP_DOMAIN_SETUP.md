# DNS Setup: app.pbookspro.com → www.app.pbookspro.com

This guide shows you how to configure DNS so that `app.pbookspro.com` points to the same service as `www.app.pbookspro.com`.

## Option 1: Add Both Domains in Render (Recommended)

The best approach is to add `app.pbookspro.com` as an additional custom domain in Render, pointing to the same `pbookspro-client` service. This way both domains work independently.

### Step 1: Add Custom Domain in Render

1. **Go to Render Dashboard** → **pbookspro-client** service
2. **Go to "Settings" tab**
3. **Scroll to "Custom Domains" section**
4. **Click "Add Custom Domain"**
5. **Enter:** `app.pbookspro.com`
6. **Click "Save"**

### Step 2: Get DNS Configuration from Render

After adding the domain, Render will show you DNS records to add:

1. **Copy the CNAME record** (or A record if provided)
2. **Note the target/hostname** (usually something like `pbookspro-client.onrender.com` or a specific hostname)

### Step 3: Add DNS Record in Your DNS Provider

Go to your DNS provider (where you manage `pbookspro.com` domain) and add:

**CNAME Record:**
- **Type:** CNAME
- **Name/Host:** `app`
- **Value/Target:** (Use the hostname provided by Render - usually `pbookspro-client.onrender.com` or a specific Render hostname)
- **TTL:** 3600 (or default)

**OR if Render provides an A record:**
- **Type:** A
- **Name/Host:** `app`
- **Value/Target:** (IP address provided by Render)
- **TTL:** 3600 (or default)

### Step 4: Update CORS in API Server

Since you're adding a new domain, update the CORS settings:

1. **Go to Render Dashboard** → **pbookspro-api** service
2. **Go to "Environment" tab**
3. **Find `CORS_ORIGIN`**
4. **Add `https://app.pbookspro.com`** to the list:
   ```
   https://www.pbookspro.com,https://www.app.pbookspro.com,https://app.pbookspro.com,https://admin.pbookspro.com,...
   ```
5. **Save** (service will auto-restart)

### Step 5: Wait for DNS Propagation

- DNS changes can take **5 minutes to 48 hours** to propagate
- Usually takes **15-30 minutes** for most providers
- Use `nslookup app.pbookspro.com` or `dig app.pbookspro.com` to check

### Step 6: Verify SSL Certificate

Render will automatically provision an SSL certificate for `app.pbookspro.com`:
- Usually takes **5-15 minutes** after DNS is verified
- Check in Render Dashboard → Custom Domains → SSL status

### Step 7: Test Both Domains

After DNS propagates and SSL is active:
- ✅ `https://www.app.pbookspro.com` should work
- ✅ `https://app.pbookspro.com` should work (redirects or serves same content)

---

## Option 2: DNS Redirect (At DNS Level)

If your DNS provider supports redirects (like Cloudflare), you can set up a redirect:

### Using Cloudflare:

1. **Go to Cloudflare Dashboard** → Select `pbookspro.com`
2. **Go to "Rules" → "Redirect Rules"**
3. **Create Redirect Rule:**
   - **Name:** `app to www.app redirect`
   - **If:** `Hostname equals app.pbookspro.com`
   - **Then:** `Redirect to https://www.app.pbookspro.com` (301 Permanent)
4. **Save**

### Using Other DNS Providers:

Check if your DNS provider supports:
- **URL Redirects**
- **HTTP Redirects**
- **301/302 Redirects**

If supported, create a redirect from `app.pbookspro.com` → `www.app.pbookspro.com`

---

## Option 3: Update render.yaml (If Using Blueprint)

If you want to manage this via `render.yaml`, you can add the domain to the service configuration:

```yaml
# Client Application (Static Site)
- type: web
  name: pbookspro-client
  runtime: static
  branch: main
  buildCommand: npm install && npm run build
  staticPublishPath: ./dist
  domains:
    - www.app.pbookspro.com
    - app.pbookspro.com  # Add this
  envVars:
    - key: VITE_API_URL
      value: https://api.pbookspro.com/api
```

**Note:** Not all Render Blueprint configurations support multiple domains in YAML. Option 1 (adding via dashboard) is more reliable.

---

## Verification Steps

### 1. Check DNS Resolution

```bash
# Windows PowerShell
nslookup app.pbookspro.com

# Should show the Render hostname or IP
```

### 2. Check SSL Certificate

```bash
# Using browser
# Visit: https://app.pbookspro.com
# Check for padlock icon (SSL working)
```

### 3. Test Both URLs

- `https://app.pbookspro.com` → Should load the client app
- `https://www.app.pbookspro.com` → Should load the client app
- Both should work identically

### 4. Check CORS

Open browser console on `app.pbookspro.com`:
- Should not see CORS errors
- API calls should work

---

## Troubleshooting

### DNS Not Resolving

1. **Wait longer** - DNS can take up to 48 hours
2. **Check DNS record** - Verify CNAME/A record is correct
3. **Check TTL** - Lower TTL (300 seconds) for faster updates
4. **Clear DNS cache:**
   ```powershell
   # Windows
   ipconfig /flushdns
   ```

### SSL Certificate Not Issuing

1. **Verify DNS is resolving** - SSL can't be issued if DNS isn't working
2. **Check in Render Dashboard** - Custom Domains → SSL status
3. **Wait 15-30 minutes** - SSL provisioning takes time
4. **Contact Render Support** - If SSL doesn't issue after 1 hour

### CORS Errors

1. **Verify CORS includes new domain:**
   - Check `CORS_ORIGIN` in API service
   - Should include `https://app.pbookspro.com`
2. **Restart API service** after updating CORS
3. **Clear browser cache** and test again

### Domain Shows "Pending" in Render

1. **Verify DNS record is correct**
2. **Wait for DNS propagation** (can take time)
3. **Check DNS record format:**
   - CNAME should point to Render hostname
   - No trailing dots
   - Correct subdomain name

---

## Recommended Configuration

**Best Practice:** Use Option 1 (Add both domains in Render)

**Why:**
- ✅ Both domains work independently
- ✅ Automatic SSL for both
- ✅ No redirect overhead
- ✅ Better for SEO (if needed)
- ✅ More flexible

**DNS Records Needed:**
- `www.app` → CNAME → Render hostname
- `app` → CNAME → Render hostname (same target)

**CORS Configuration:**
```
https://www.pbookspro.com,https://www.app.pbookspro.com,https://app.pbookspro.com,https://admin.pbookspro.com,...
```

---

## Summary

1. ✅ Add `app.pbookspro.com` as custom domain in Render Dashboard
2. ✅ Add CNAME record in DNS provider pointing to Render
3. ✅ Update CORS in API service to include new domain
4. ✅ Wait for DNS propagation and SSL provisioning
5. ✅ Test both domains work correctly

After setup, both `app.pbookspro.com` and `www.app.pbookspro.com` will serve the same client application.
