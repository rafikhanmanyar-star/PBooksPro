# Step-by-Step: Merge Update Server and Website

This document provides detailed steps to merge the update server and website into a single portal.

## Prerequisites

- Backup both current deployments
- Access to GitHub repository
- Access to Render dashboard (or your hosting platform)
- Test environment available

## Step 1: Prepare File Structure

### 1.1 Create Public Directory in Update Server

```bash
cd update-server
mkdir public
```

### 1.2 Copy Website Files

```bash
# From project root
cp -r website/* update-server/public/
# Or on Windows:
xcopy website\* update-server\public\ /E /I
```

### 1.3 Verify Structure

Your `update-server/` should now have:
```
update-server/
├── server.cjs
├── public/              # NEW - Website files
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
├── releases/
├── package.json
└── render.yaml
```

## Step 2: Update server.cjs

Add static file serving capability to the existing server.

### 2.1 Add Static File Serving Function

Add this function after the existing helper functions (around line 150):

```javascript
// Serve static files from public directory
function serveStaticFile(filePath, req, res) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
  };
  
  const mimeType = mimeTypes[ext] || 'application/octet-stream';
  
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      send404(res, filePath);
      return;
    }
    
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', stats.size);
    
    // Cache static assets
    if (ext === '.html') {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year for assets
    }
    
    res.writeHead(200);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    console.log(`  → 200 OK: ${filePath} (${stats.size} bytes)`);
  });
}
```

### 2.2 Update Request Handler

Modify the main request handler (around line 400) to check for static files first:

```javascript
// In the main server request handler, add this BEFORE existing route handlers:

const parsedUrl = url.parse(req.url, true);
const pathname = parsedUrl.pathname;

// 1. API Routes (highest priority)
if (pathname.startsWith('/api/')) {
  // Handle API routes (existing code)
  // ... existing API handling ...
  return;
}

// 2. Update Server Routes
if (pathname === '/latest.yml' || pathname.startsWith('/releases/')) {
  // Handle update server routes (existing code)
  // ... existing update handling ...
  return;
}

// 3. Static Website Files (fallback)
const publicDir = path.join(__dirname, 'public');
let filePath = pathname;

// Map root to index.html
if (pathname === '/' || pathname === '') {
  filePath = '/index.html';
}

// Remove leading slash for path joining
const cleanPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
const fullPath = path.join(publicDir, cleanPath);
const resolvedPath = path.resolve(fullPath);

// Security check - ensure we're only serving from public directory
if (!resolvedPath.startsWith(path.resolve(publicDir))) {
  console.error(`Security violation: ${resolvedPath} is outside public directory`);
  res.writeHead(403, { 'Content-Type': 'text/plain' });
  res.end('Forbidden');
  return;
}

// Try to serve static file
fs.stat(resolvedPath, (err, stats) => {
  if (!err && stats.isFile()) {
    serveStaticFile(resolvedPath, req, res);
  } else {
    // File not found - try with .html extension for clean URLs
    if (!path.extname(resolvedPath)) {
      const htmlPath = resolvedPath + '.html';
      fs.stat(htmlPath, (htmlErr, htmlStats) => {
        if (!htmlErr && htmlStats.isFile()) {
          serveStaticFile(htmlPath, req, res);
        } else {
          send404(res, pathname);
        }
      });
    } else {
      send404(res, pathname);
    }
  }
});
```

## Step 3: Update Configuration

### 3.1 Update CONFIG Object

Add public directory to config (around line 15):

```javascript
const CONFIG = {
  port: process.env.PORT || 3001,
  host: '0.0.0.0',
  releasesDir: path.join(__dirname, 'releases'),
  publicDir: path.join(__dirname, 'public'),  // NEW
  // ... rest of config
};
```

### 3.2 Ensure Public Directory Exists

Add this after releases directory check (around line 50):

```javascript
// Ensure public directory exists
try {
  if (!fs.existsSync(CONFIG.publicDir)) {
    fs.mkdirSync(CONFIG.publicDir, { recursive: true });
    console.log(`Created public directory: ${CONFIG.publicDir}`);
  }
} catch (error) {
  console.error('Error creating public directory:', error);
}
```

## Step 4: Test Locally

### 4.1 Start Server

```bash
cd update-server
node server.cjs
```

### 4.2 Test Routes

Open browser and test:
- `http://localhost:3001/` → Should show website homepage
- `http://localhost:3001/features` → Should show features page
- `http://localhost:3001/pricing` → Should show pricing page
- `http://localhost:3001/api/status` → Should show API status (JSON)
- `http://localhost:3001/latest.yml` → Should show update metadata

### 4.3 Verify Assets

Check that CSS, JS, and images load:
- Open browser DevTools (F12)
- Check Network tab
- Verify all assets load with 200 status

## Step 5: Update Deployment

### 5.1 Update render.yaml (if needed)

The existing render.yaml should work, but verify:

```yaml
services:
  - type: web
    name: pbookspro-portal  # Update name if desired
    env: node
    plan: free
    buildCommand: ""
    startCommand: node server.cjs
    rootDir: update-server
    envVars:
      - key: NODE_ENV
        value: production
      - key: GITHUB_TOKEN
        value: ${GITHUB_TOKEN}
```

### 5.2 Commit Changes

```bash
# Add new files
git add update-server/public/
git add update-server/server.cjs

# Commit
git commit -m "Merge website into update server portal"

# Push
git push origin main
```

## Step 6: Deploy to Render

### 6.1 Automatic Deployment

If connected to GitHub, Render will auto-deploy.

### 6.2 Manual Deployment

1. Go to Render dashboard
2. Select your service
3. Click "Manual Deploy" → "Deploy latest commit"

### 6.3 Verify Deployment

After deployment, test:
- Website loads at your Render URL
- Update API still works
- All pages accessible

## Step 7: Update Domain/DNS (if applicable)

### 7.1 If Using Custom Domain

1. Update DNS records if needed
2. Update CNAME in Render dashboard
3. Wait for DNS propagation (up to 48 hours)

### 7.2 Update Links

Update any hardcoded links in:
- Application code
- Documentation
- Marketing materials

## Step 8: Cleanup

### 8.1 Remove Old Website Deployment

After confirming merged portal works:
1. Delete old website service in Render/Netlify
2. Remove website deployment configuration
3. Update documentation

### 8.2 Update Documentation

Update these files:
- `update-server/README.md` - Add website info
- `website/README.md` - Note it's merged
- Any deployment guides

## Step 9: Monitoring

### 9.1 Check Logs

Monitor Render logs for:
- 404 errors (missing files)
- 500 errors (server issues)
- Performance issues

### 9.2 Test Regularly

- Website pages load
- Update API responds
- Forms work (if integrated)
- Mobile responsiveness

## Troubleshooting

### Issue: Website files not loading

**Solution:**
- Check file paths in `public/` directory
- Verify `publicDir` path in CONFIG
- Check file permissions
- Review server logs

### Issue: Update API not working

**Solution:**
- Verify API routes are checked before static files
- Check `/api/` route handling
- Test API endpoints directly

### Issue: CSS/JS not loading

**Solution:**
- Check file paths in HTML
- Verify MIME types in `serveStaticFile`
- Check browser console for errors
- Ensure files are in `public/` directory

### Issue: 404 errors

**Solution:**
- Check route order (API → Updates → Static)
- Verify file extensions
- Check `.html` fallback logic
- Review path resolution

## Rollback Plan

If issues occur:

1. **Keep old deployments running** during transition
2. **Revert Git commit** if needed:
   ```bash
   git revert HEAD
   git push origin main
   ```
3. **Switch DNS back** to old services
4. **Investigate issues** in staging
5. **Re-deploy** after fixes

## Success Criteria

✅ Website homepage loads  
✅ All website pages accessible  
✅ Website assets (CSS, JS, images) load  
✅ Update API endpoints work  
✅ Update metadata accessible  
✅ No 404 errors for expected routes  
✅ Mobile responsive  
✅ Forms work (if integrated)  

## Next Steps After Merge

1. **Optimize Performance**
   - Add caching headers
   - Compress static assets
   - Use CDN if needed

2. **Add Analytics**
   - Google Analytics
   - Update server metrics

3. **Enhance Integration**
   - Link website to update API
   - Show version info on website
   - Add download links

4. **SEO Optimization**
   - Meta tags
   - Sitemap
   - robots.txt

## Support

For issues during merge:
- Check server logs in Render
- Test locally first
- Review this guide
- Check GitHub issues

