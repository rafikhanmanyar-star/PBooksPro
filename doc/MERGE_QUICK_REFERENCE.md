# Quick Reference: Merge Update Server & Website

## ✅ Yes, You Can Merge Them!

Both portals can be merged into a single service. Here's the quick overview:

## What Gets Merged

- **Update Server** (API for app updates) + **Website** (Marketing pages) = **Unified Portal**

## Benefits

✅ One deployment instead of two  
✅ One domain/URL  
✅ Easier to manage  
✅ Cost savings  
✅ Better integration  

## Quick Implementation

### Option 1: Merge into Update Server (Recommended)

1. Copy website files to `update-server/public/`
2. Update `server.cjs` to serve static files
3. Deploy updated server
4. Done!

### Option 2: Keep Separate (Use Subdomains)

- `updates.yourdomain.com` - Update server
- `www.yourdomain.com` - Website

## File Structure After Merge

```
update-server/
├── server.cjs          # Enhanced to serve both
├── public/             # NEW - Website files
│   ├── index.html
│   ├── features.html
│   ├── styles.css
│   └── ...
├── releases/           # Existing - Update files
└── package.json
```

## Routing After Merge

```
/                    → Website homepage
/features            → Website features page
/pricing             → Website pricing page
/api/status          → Update server API
/latest.yml          → Update metadata
/releases/*          → Release files
```

## Quick Commands

### Prepare Files
```bash
# Copy website to update server
cp -r website/* update-server/public/
```

### Test Locally
```bash
cd update-server
node server.cjs
# Visit http://localhost:3001
```

### Deploy
```bash
git add update-server/
git commit -m "Merge website into update server"
git push origin main
```

## Documentation

- **Full Guide**: `doc/MERGE_UPDATE_SERVER_AND_WEBSITE.md`
- **Step-by-Step**: `doc/MERGE_IMPLEMENTATION_STEPS.md`
- **This File**: Quick reference

## Need Help?

1. Read the full implementation guide
2. Test locally first
3. Deploy to staging
4. Test thoroughly
5. Deploy to production

## Decision Matrix

| Factor | Merge | Keep Separate |
|--------|-------|---------------|
| **Deployments** | 1 | 2 |
| **Cost** | Lower | Higher |
| **Complexity** | Medium | Low |
| **Management** | Easier | More work |
| **Scaling** | Together | Independent |

**Recommendation**: Merge them for simplicity and cost savings.

