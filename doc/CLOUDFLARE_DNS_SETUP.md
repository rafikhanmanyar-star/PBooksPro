# Cloudflare DNS Setup Guide for PBooksPro.com

This guide will help you configure DNS settings for your domain registered with Cloudflare.

## Prerequisites

✅ Domain registered with Cloudflare: `pbookspro.com`  
✅ Access to Cloudflare dashboard  
✅ Hosting provider/service (for website/app)  
✅ Email hosting service (optional, for professional emails)

---

## Step 1: Initial Cloudflare Setup

### 1.1 Add Domain to Cloudflare (if not already added)

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click **"Add a Site"**
3. Enter `pbookspro.com`
4. Select a plan (Free plan is sufficient for most needs)
5. Cloudflare will scan your existing DNS records

### 1.2 Update Nameservers

Cloudflare will provide you with nameservers (e.g., `linda.ns.cloudflare.com`, `pete.ns.cloudflare.com`).

1. Go to your domain registrar (where you purchased the domain)
2. Update nameservers to Cloudflare's nameservers
3. Wait 24-48 hours for DNS propagation (usually much faster)

---

## Step 2: DNS Record Configuration

Once your domain is active on Cloudflare, configure DNS records in the Cloudflare dashboard.

### 2.1 Basic DNS Records

Go to **DNS** → **Records** in Cloudflare dashboard and add:

**⚠️ Important:** Your website is hosted on **Cloudflare Pages**. Since both DNS and hosting are on Cloudflare, DNS configuration is automatic when you add custom domains in Pages.

### Automatic DNS Configuration

When you add custom domains in Cloudflare Pages:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Pages**
2. Select your Pages project
3. Go to **Custom domains** → **Set up a custom domain**
4. Enter: `pbookspro.com` and `www.pbookspro.com`
5. Cloudflare automatically:
   - Creates DNS records
   - Provisions SSL certificate
   - Configures redirects

**No manual DNS configuration needed!** Cloudflare Pages automatically creates the required CNAME records.

### Manual DNS (If Needed)

If you need to check or manually configure DNS, the records should be:

#### For Root Domain (pbookspro.com) - Main Website
```
Type: CNAME
Name: @
Content: [your-pages-project].pages.dev
Proxy: ✅ Proxied (orange cloud)
TTL: Auto
```

#### For WWW Subdomain (www.pbookspro.com)
```
Type: CNAME
Name: www
Content: [your-pages-project].pages.dev
Proxy: ✅ Proxied (orange cloud)
TTL: Auto
```

**Note:** The exact Pages URL (`.pages.dev` subdomain) is shown in your Pages project dashboard. Usually in format: `pbookspro-website.pages.dev` or similar.

#### For API Server (api.pbookspro.com)
```
Type: CNAME
Name: api
Content: pbookspro-api.onrender.com
Proxy: ✅ Proxied (orange cloud)
TTL: Auto
```

#### For Admin Panel (admin.pbookspro.com)
```
Type: CNAME
Name: admin
Content: pbookspro-admin.onrender.com
Proxy: ✅ Proxied (orange cloud)
TTL: Auto
```

#### For App/Client (app.pbookspro.com - optional, if you want separate from root)
```
Type: CNAME
Name: app
Content: pbookspro-client.onrender.com
Proxy: ✅ Proxied (orange cloud)
TTL: Auto
```

### 2.2 Email Configuration (MX Records)

If you're setting up email hosting (Google Workspace, Microsoft 365, etc.):

#### For Google Workspace
```
Type: MX
Name: @
Priority: 1
Content: aspmx.l.google.com
Proxy: ❌ DNS only (grey cloud)
TTL: Auto
```

Add additional MX records:
- Priority: 5 → `alt1.aspmx.l.google.com`
- Priority: 5 → `alt2.aspmx.l.google.com`
- Priority: 10 → `alt3.aspmx.l.google.com`
- Priority: 10 → `alt4.aspmx.l.google.com`

#### For Microsoft 365
```
Type: MX
Name: @
Priority: 0
Content: [Your domain].mail.protection.outlook.com
Proxy: ❌ DNS only (grey cloud)
TTL: Auto
```

### 2.3 Email Verification Records (SPF, DKIM, DMARC)

#### SPF Record (prevents email spoofing)
```
Type: TXT
Name: @
Content: v=spf1 include:_spf.google.com ~all
Proxy: ❌ DNS only
TTL: Auto
```

#### DMARC Record
```
Type: TXT
Name: _dmarc
Content: v=DMARC1; p=none; rua=mailto:admin@pbookspro.com
Proxy: ❌ DNS only
TTL: Auto
```

**Note:** DKIM records are usually provided by your email hosting service and should be added when you set up email hosting.

---

## Step 3: SSL/TLS Configuration

Cloudflare provides free SSL certificates!

1. Go to **SSL/TLS** in Cloudflare dashboard
2. Set SSL/TLS encryption mode to **"Full"** or **"Full (strict)"**
   - **Full**: Encrypts connection between visitor and Cloudflare, and between Cloudflare and your server
   - **Full (strict)**: Same as Full, but validates your server's SSL certificate
3. Enable **"Always Use HTTPS"** (redirect HTTP to HTTPS)
4. Enable **"Automatic HTTPS Rewrites"**

---

## Step 4: Performance & Security Settings

### 4.1 Speed Optimization
- **Auto Minify**: Enable for HTML, CSS, JavaScript
- **Brotli**: Enable (compression)
- **Caching**: Set appropriate cache levels

### 4.2 Security
- **Security Level**: Medium (adjust based on needs)
- **WAF (Web Application Firewall)**: Available on paid plans
- **Bot Fight Mode**: Enable on free plan
- **Rate Limiting**: Available on paid plans

---

## Step 5: Page Rules (Optional)

Create rules for specific URL patterns:

Example: Cache everything on `/assets/`
```
URL Pattern: pbookspro.com/assets/*
Setting: Cache Level: Cache Everything
```

---

## Step 6: Email Hosting Setup

Cloudflare **does not provide email hosting**. You'll need a separate service:

### Option 1: Google Workspace (Recommended)
- **Cost**: ~$6-12/user/month
- **Features**: Professional email, calendar, drive, docs
- **Setup**: 
  1. Sign up at [workspace.google.com](https://workspace.google.com)
  2. Add your domain `pbookspro.com`
  3. Verify domain ownership (add TXT record provided by Google)
  4. Add MX records (see Step 2.2)
  5. Create email accounts (support@pbookspro.com, sales@pbookspro.com)

### Option 2: Microsoft 365
- **Cost**: ~$6-12/user/month
- **Features**: Professional email, Office suite
- **Setup**: Similar to Google Workspace

### Option 3: Zoho Mail (Budget Option)
- **Cost**: Free for up to 5 users (with Zoho branding) or ~$1/user/month
- **Features**: Email, calendar, contacts
- **Setup**: Sign up at [zoho.com/mail](https://zoho.com/mail)

### Option 4: Cloudflare Email Routing (Free, Basic)
- **Cost**: FREE
- **Features**: Email forwarding only (not full email hosting)
- **Limitations**: Can forward emails but doesn't provide inbox/storage
- **Use Case**: Forward support@pbookspro.com to your personal email

---

## Recommended DNS Record Summary

Here's the recommended setup for PBooksPro:

```
Type    Name    Content                          Proxy
------------------------------------------------------------
CNAME   @       [pages-project].pages.dev        ✅ (Auto-created by Pages)
CNAME   www     [pages-project].pages.dev        ✅ (Auto-created by Pages)
CNAME   api     pbookspro-api.onrender.com       ✅
CNAME   admin   pbookspro-admin.onrender.com     ✅
MX      @       aspmx.l.google.com (Priority: 1) ❌
TXT     @       v=spf1 include:_spf.google.com ~all ❌
TXT     _dmarc  v=DMARC1; p=none; ...            ❌
```

**Notes:**
- **Website:** Hosted on Cloudflare Pages (DNS records auto-created when adding custom domain)
- **API & Admin:** Hosted on Render
- **Pages DNS:** Automatically configured when you add custom domains in Pages dashboard
- **Manual DNS:** Only needed if you want to configure manually (not recommended)

---

## Next Steps

1. ✅ Configure DNS records based on your hosting setup
2. ⏳ Set up SSL/TLS (automatic with Cloudflare)
3. ⏳ Configure email hosting (Google Workspace or alternative)
4. ⏳ Test DNS propagation: [whatsmydns.net](https://www.whatsmydns.net)
5. ⏳ Test email: Send test emails to verify MX records
6. ⏳ Update application environment variables with new domain
7. ⏳ Update CORS settings in your API server
8. ⏳ Test website accessibility at https://pbookspro.com

---

## Troubleshooting

### DNS Not Propagating
- Wait 24-48 hours (usually faster)
- Check with [whatsmydns.net](https://www.whatsmydns.net)
- Clear DNS cache: `ipconfig /flushdns` (Windows)

### SSL Issues
- Ensure SSL/TLS mode is set to "Full" or "Full (strict)"
- Check your origin server has SSL certificate
- Use "Full" if origin server has self-signed certificate

### Email Not Working
- Verify MX records are correct
- Check SPF record syntax
- Verify email hosting account is active
- Check email hosting service documentation

### Website Not Loading
- Verify A/CNAME records point to correct servers
- Check if origin server is running
- Verify firewall rules allow Cloudflare IPs
- Check Cloudflare SSL/TLS mode

---

## Resources

- [Cloudflare DNS Docs](https://developers.cloudflare.com/dns/)
- [Cloudflare SSL/TLS Docs](https://developers.cloudflare.com/ssl/)
- [Google Workspace Setup](https://support.google.com/a/answer/140034)
- [DNS Propagation Checker](https://www.whatsmydns.net)

---

**Last Updated**: 2024
