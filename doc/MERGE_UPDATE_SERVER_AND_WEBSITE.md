# Merge Update Server and Website Portal

This guide explains how to merge the **Update Server** and **Website** into a single unified portal.

## Current Structure

### Update Server (`update-server/`)
- **Purpose**: Serves application updates for auto-update functionality
- **Technology**: Node.js HTTP server (server.cjs)
- **Endpoints**: 
  - `GET /` - Server info page
  - `GET /latest.yml` - Update metadata
  - `GET /api/status` - Server status (JSON)
  - `GET /releases/*` - Release files
- **Deployment**: Separate Render service

### Website (`website/`)
- **Purpose**: Marketing/landing pages
- **Technology**: Static HTML/CSS/JS
- **Pages**: index, features, pricing, about, contact, demo, download, blog
- **Deployment**: Separate service (Netlify or similar)

## Benefits of Merging

✅ **Single Deployment**: One service instead of two  
✅ **Unified Domain**: One URL for everything  
✅ **Easier Management**: Single codebase and deployment  
✅ **Cost Savings**: One service instead of two  
✅ **Better Integration**: Website can link directly to update endpoints  

## Implementation Options

### Option 1: Merge into Update Server (Recommended)

Add static file serving to the update server to host the website.

**Pros:**
- Update server already handles HTTP requests
- Simple to implement
- Maintains existing update functionality

**Cons:**
- Update server becomes more complex
- Need to handle static file routing

### Option 2: Merge into Main API Server

Add both update server and website to the main API server.

**Pros:**
- Everything in one place
- Can share authentication/features
- Unified backend

**Cons:**
- More complex integration
- Main server handles more responsibilities

### Option 3: Keep Separate but Use Subdomains

Keep them separate but use subdomains:
- `updates.yourdomain.com` - Update server
- `www.yourdomain.com` - Website

**Pros:**
- Clear separation of concerns
- Easy to scale independently

**Cons:**
- Still two deployments
- More DNS configuration

## Recommended: Option 1 - Merge into Update Server

We'll enhance the update server to serve both:
1. Update API endpoints (existing)
2. Static website files (new)

## Implementation Steps

### Step 1: Update Update Server Structure

```
update-server/
├── server.cjs              # Main server (enhanced)
├── public/                 # NEW: Website static files
│   ├── index.html
│   ├── features.html
│   ├── pricing.html
│   ├── about.html
│   ├── contact.html
│   ├── demo.html
│   ├── download.html
│   ├── blog.html
│   ├── help.html
│   ├── styles.css
│   ├── script.js
│   └── images/
├── releases/               # Existing: Update files
├── routes/                 # NEW: API routes
│   └── updates.js
└── package.json
```

### Step 2: Enhanced Server Code

The server will:
1. Serve static website files from `/public`
2. Handle update API routes (`/api/*`)
3. Serve release files from `/releases`
4. Provide a unified entry point

### Step 3: Routing Logic

```
/                    → website/index.html
/features            → website/features.html
/pricing             → website/pricing.html
/about               → website/about.html
/contact             → website/contact.html
/demo                → website/demo.html
/download            → website/download.html
/blog                → website/blog.html
/help                → website/help.html

/api/status          → Update server status
/api/latest          → Latest version info
/latest.yml          → Update metadata
/releases/*          → Release files
```

## Detailed Implementation

### Enhanced server.cjs Structure

```javascript
// Route handling priority:
// 1. API routes (/api/*)
// 2. Update routes (/latest.yml, /releases/*)
// 3. Static website files (everything else)
```

### File Organization

1. **Move website files** to `update-server/public/`
2. **Update server.cjs** to serve static files
3. **Update routes** to handle both website and API
4. **Update render.yaml** if needed

## Migration Checklist

- [ ] Copy website files to `update-server/public/`
- [ ] Update server.cjs to serve static files
- [ ] Test all website pages load correctly
- [ ] Test update endpoints still work
- [ ] Update deployment configuration
- [ ] Update DNS/domain settings
- [ ] Test in production
- [ ] Remove old website deployment

## Deployment Configuration

### Updated render.yaml

```yaml
services:
  - type: web
    name: pbookspro-portal
    env: node
    plan: free
    buildCommand: ""
    startCommand: node server.cjs
    rootDir: update-server
    envVars:
      - key: NODE_ENV
        value: production
      - key: GITHUB_TOKEN
        value: ${GITHUB_TOKEN}  # Set in Render dashboard
```

## Testing Checklist

After merging, test:

- [ ] Website homepage loads
- [ ] All website pages work (features, pricing, etc.)
- [ ] Website CSS and JS load correctly
- [ ] Website images display
- [ ] Update API endpoints work (`/api/status`)
- [ ] Update metadata works (`/latest.yml`)
- [ ] Release files can be downloaded
- [ ] Mobile responsiveness works
- [ ] Forms work (if integrated)

## Rollback Plan

If issues occur:

1. Keep old deployments running
2. Test merged version thoroughly
3. Switch DNS/domain when ready
4. Monitor for 24-48 hours
5. Remove old deployments after confirmation

## Next Steps

1. Review this plan
2. Choose implementation option
3. Create backup of current deployments
4. Implement changes
5. Test locally
6. Deploy to staging
7. Test in production
8. Switch traffic
9. Monitor and optimize

## Questions to Consider

1. **Domain**: What domain will the merged portal use?
   - `portal.pbookspro.com`
   - `www.pbookspro.com`
   - `pbookspro.com`

2. **SSL**: Ensure HTTPS is configured

3. **CDN**: Consider CDN for static assets

4. **Analytics**: Update analytics tracking codes

5. **Forms**: Update form endpoints if needed

## Support

For questions or issues during the merge, refer to:
- Update Server README: `update-server/README.md`
- Website README: `website/README.md`
- This guide

