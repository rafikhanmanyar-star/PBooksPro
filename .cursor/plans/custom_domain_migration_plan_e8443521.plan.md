---
name: Custom Domain Migration Plan
overview: "Migrate all production services from Render subdomains to custom domain pbookspro.com with the following mapping: www.pbookspro.com → website, www.app.pbookspro.com → client app, admin.pbookspro.com → admin app, api.pbookspro.com → API server. This includes DNS configuration, Render custom domain setup, environment variable updates, and render.yaml configuration."
todos:
  - id: add-website-service
    content: Add pbookspro-website static site service to render.yaml pointing to website/Website directory
    status: pending
  - id: update-api-env-vars
    content: Update API server environment variables in render.yaml (CORS_ORIGIN, API_URL, SERVER_URL, CLIENT_URL) to use new custom domains
    status: pending
  - id: update-client-env-vars
    content: Update client app environment variable VITE_API_URL in render.yaml to use api.pbookspro.com
    status: pending
  - id: update-admin-env-vars
    content: Update admin app environment variable VITE_ADMIN_API_URL in render.yaml to use api.pbookspro.com
    status: pending
---

# Custom Domain Migration Plan

## Overview

Migrate production applications from Render subdomains to custom domain `pbookspro.com` with the following domain structure:

- `www.pbookspro.com` → Marketing/landing website
- `www.app.pbookspro.com` → Client application
- `admin.pbookspro.com` → Admin portal
- `api.pbookspro.com` → API server

## Current State

- **API Server**: `pbookspro-api` service (deployed)
- **Client App**: `pbookspro-client` service (deployed)
- **Admin App**: `pbookspro-admin` service (deployed)
- **Website**: Static HTML files in `website/Website/` directory (not yet deployed as Render service)

## Implementation Steps

### 1. Add Website Service to render.yaml

Add a new static site service for the marketing website in [render.yaml](render.yaml):

```yaml
# Website (Marketing/Landing Page)
- type: web
  name: pbookspro-website
  runtime: static
  branch: main
  buildCommand: echo "No build needed for static site"
  staticPublishPath: ./website/Website
```

### 2. Update render.yaml Environment Variables

Update all environment variables in [render.yaml](render.yaml) to use the new custom domains:

**API Server (`pbookspro-api`):**

- `CORS_ORIGIN`: Add new domains: `https://www.pbookspro.com,https://www.app.pbookspro.com,https://admin.pbookspro.com`
- `API_URL`: `https://api.pbookspro.com`
- `SERVER_URL`: `https://api.pbookspro.com`
- `CLIENT_URL`: `https://www.app.pbookspro.com`

**Client App (`pbookspro-client`):**

- `VITE_API_URL`: `https://api.pbookspro.com/api`

**Admin App (`pbookspro-admin`):**

- `VITE_ADMIN_API_URL`: `https://api.pbookspro.com/api/admin`

### 3. DNS Configuration (Manual Step)

Configure DNS records at your domain registrar:

**CNAME Records:**

- `www` → `pbookspro-website.onrender.com` (for website)
- `www.app` → `pbookspro-client.onrender.com` (for client app)
- `admin` → `pbookspro-admin.onrender.com` (for admin app)
- `api` → `pbookspro-api.onrender.com` (for API server)

**Note:** The `www.app` subdomain requires creating a CNAME for `www` under the `app` subdomain. Some DNS providers may require creating `app` first, then `www` under it.

### 4. Render Dashboard Configuration (Manual Steps)

After DNS is configured, add custom domains in Render Dashboard:

1. **Website Service** (`pbookspro-website`):

   - Settings → Custom Domains → Add `www.pbookspro.com`
   - Wait for DNS verification

2. **Client App** (`pbookspro-client`):

   - Settings → Custom Domains → Add `www.app.pbookspro.com`
   - Wait for DNS verification

3. **Admin App** (`pbookspro-admin`):

   - Settings → Custom Domains → Add `admin.pbookspro.com`
   - Wait for DNS verification

4. **API Server** (`pbookspro-api`):

   - Settings → Custom Domains → Add `api.pbookspro.com`
   - Wait for DNS verification

### 5. Update Environment Variables in Render Dashboard

After custom domains are verified, update environment variables in Render Dashboard (these will override render.yaml on next deploy):

**API Server:**

- Update `CORS_ORIGIN` to include all new domains
- Update `API_URL`, `SERVER_URL`, `CLIENT_URL`

**Client App:**

- Update `VITE_API_URL` and trigger manual rebuild

**Admin App:**

- Update `VITE_ADMIN_API_URL` and trigger manual rebuild

### 6. Verification and Testing

- Verify all domains resolve correctly
- Test SSL certificates (auto-provisioned by Render)
- Test API connectivity from client and admin apps
- Verify CORS headers allow requests from new domains
- Test all functionality end-to-end

## Files to Modify

1. [render.yaml](render.yaml) - Add website service and update all environment variables

## Important Notes

- DNS propagation can take 24-48 hours (often completes in minutes)
- SSL certificates are auto-provisioned by Render (may take a few hours)
- Frontend apps must be rebuilt after environment variable changes
- Keep old Render subdomains in CORS_ORIGIN during transition for safety
- The `www.app.pbookspro.com` subdomain structure is valid but requires proper DNS setup

## Rollback Plan

If issues occur:

1. Revert environment variables in Render Dashboard
2. Remove custom domains from Render services
3. Update DNS records back to original
4. Rebuild services with old URLs