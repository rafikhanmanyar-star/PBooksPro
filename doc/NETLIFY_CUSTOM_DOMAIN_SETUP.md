# Netlify Custom Domain Setup for PBooksPro.com

This guide explains how to connect your Cloudflare domain (`pbookspro.com`) to your Netlify site (`myprojectpro.netlify.app`).

## Prerequisites

✅ Domain registered with Cloudflare: `pbookspro.com`  
✅ Website deployed on Netlify: `myprojectpro.netlify.app`  
✅ Access to both Cloudflare and Netlify dashboards

---

## Step 1: Add Custom Domain in Netlify

### 1.1 Go to Netlify Domain Settings

1. Log in to [Netlify Dashboard](https://app.netlify.com)
2. Select your site: **myprojectpro**
3. Go to **Site settings** → **Domain management** → **Domains**
4. Click **Add custom domain**

### 1.2 Add Your Domain

1. Enter: `pbookspro.com`
2. Click **Verify**
3. Netlify will check if the domain is available
4. Click **Add domain**

### 1.3 Add WWW Subdomain (Optional but Recommended)

1. Click **Add custom domain** again
2. Enter: `www.pbookspro.com`
3. Click **Verify** and **Add domain**

Netlify will automatically set up the redirect between `pbookspro.com` and `www.pbookspro.com`.

---

## Step 2: Configure DNS in Cloudflare

### 2.1 Go to Cloudflare DNS Settings

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select your domain: `pbookspro.com`
3. Go to **DNS** → **Records**

### 2.2 Add Root Domain CNAME

Click **Add record** and configure:

```
Type: CNAME
Name: @
Content: myprojectpro.netlify.app
Proxy status: Proxied (orange cloud)
TTL: Auto
```

Click **Save**.

### 2.3 Add WWW Subdomain CNAME

Click **Add record** again and configure:

```
Type: CNAME
Name: www
Content: myprojectpro.netlify.app
Proxy status: Proxied (orange cloud)
TTL: Auto
```

Click **Save**.

---

## Step 3: Verify Domain in Netlify

After adding DNS records:

1. Go back to Netlify Dashboard
2. Navigate to **Site settings** → **Domain management** → **Domains**
3. You should see `pbookspro.com` and `www.pbookspro.com` listed
4. Netlify will automatically verify the DNS records
5. Status should change to **Verified** (may take a few minutes)

### 3.1 SSL Certificate

Netlify automatically provisions SSL certificates:
- Go to **Site settings** → **Domain management** → **HTTPS**
- Netlify will issue a Let's Encrypt certificate automatically
- Usually takes 5-10 minutes
- Status should show **Certificate issued**

---

## Step 4: Wait for DNS Propagation

DNS changes can take time to propagate:

- **Cloudflare (proxied)**: Usually instant or within minutes
- **Global propagation**: Can take up to 48 hours (usually much faster)
- Check status: [whatsmydns.net](https://www.whatsmydns.net/#CNAME/pbookspro.com)

---

## Step 5: Test Your Domain

After DNS propagation and SSL certificate issuance:

1. **Test root domain**: Visit `https://pbookspro.com`
2. **Test www subdomain**: Visit `https://www.pbookspro.com`
3. Both should load your website
4. Check SSL: Look for the padlock icon in your browser

---

## Alternative: Domain-Specific Netlify Alias

After adding your custom domain, Netlify may create a domain-specific alias:

- Instead of: `myprojectpro.netlify.app`
- You might see: `pbookspro.netlify.app`

If this happens, update your Cloudflare DNS records to use the domain-specific alias:

```
Type: CNAME
Name: @
Content: pbookspro.netlify.app  (instead of myprojectpro.netlify.app)
```

---

## Troubleshooting

### Domain Not Verifying in Netlify

**Issue:** Netlify shows "DNS configuration required" or "Not verified"

**Solutions:**
1. Wait 5-10 minutes for DNS propagation
2. Verify DNS records are correct in Cloudflare:
   - Type: CNAME
   - Name: @ (or www)
   - Content: `myprojectpro.netlify.app`
   - Proxy: Enabled (orange cloud)
3. Check DNS propagation: [whatsmydns.net](https://www.whatsmydns.net/#CNAME/pbookspro.com)
4. In Netlify, click **Verify DNS configuration** again

### SSL Certificate Not Issuing

**Issue:** HTTPS shows "Certificate provisioning" for too long

**Solutions:**
1. Ensure DNS records are verified
2. Make sure domain resolves correctly
3. Wait 15-30 minutes (certificate provisioning can take time)
4. In Netlify: **Domain management** → **HTTPS** → Click **Verify DNS configuration**
5. Try forcing renewal: **HTTPS** → **Renew certificate**

### Website Not Loading

**Issue:** Domain resolves but shows error or doesn't load

**Solutions:**
1. Check if your Netlify site is deployed and working: `https://myprojectpro.netlify.app`
2. Verify DNS records in Cloudflare
3. Check Netlify deployment status
4. Clear browser cache
5. Try incognito/private browsing mode
6. Check Netlify site logs for errors

### CNAME Record Issues in Cloudflare

**Issue:** Cloudflare shows error when adding CNAME

**Solutions:**
1. For root domain (@): Make sure you're using CNAME (not A record)
2. Cloudflare supports CNAME on root through "CNAME flattening"
3. If error persists, check for conflicting records
4. Ensure proxy is enabled (orange cloud) for best compatibility

---

## Additional Configuration

### Redirects

Netlify automatically redirects between `pbookspro.com` and `www.pbookspro.com`. To customize:

1. Create `_redirects` file in your site root (or `netlify.toml`)
2. Add redirect rules as needed

### Custom Headers

Add custom headers in Netlify:

1. Go to **Site settings** → **Build & deploy** → **Post processing** → **Headers**
2. Add security headers, CORS headers, etc.

### Environment Variables

If your site needs environment variables:

1. Go to **Site settings** → **Build & deploy** → **Environment**
2. Add variables as needed
3. Redeploy if necessary

---

## Next Steps

After your domain is set up:

1. ✅ Test website at `https://pbookspro.com`
2. ✅ Verify SSL certificate is active
3. ✅ Test forms and functionality
4. ⏳ Set up email hosting (see `CLOUDFLARE_DNS_SETUP.md`)
5. ⏳ Configure API subdomain (api.pbookspro.com) if needed
6. ⏳ Configure admin subdomain (admin.pbookspro.com) if needed

---

## Resources

- [Netlify Custom Domains Documentation](https://docs.netlify.com/domains-https/custom-domains/)
- [Netlify SSL/TLS Documentation](https://docs.netlify.com/domains-https/https-ssl/)
- [Cloudflare CNAME Flattening](https://developers.cloudflare.com/dns/additional-options/cname-flattening/)
- [DNS Propagation Checker](https://www.whatsmydns.net/)

---

**Last Updated**: 2024
