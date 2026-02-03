# Monorepo Deployment Checklist for Render

This checklist ensures your monorepo is ready for deployment to Render.

## ✅ Pre-Deployment Checklist

### 1. Repository Structure
- [x] All code in one repository (monorepo)
- [x] `render.yaml` in root directory
- [x] `server/` directory with API code
- [x] `admin/` directory with admin portal code
- [x] Root directory with client app code

### 2. Configuration Files

#### Root Directory
- [x] `render.yaml` - Deployment configuration
- [x] `package.json` - Client app dependencies
- [x] `.gitignore` - Excludes .env, node_modules, etc.

#### Server Directory
- [x] `server/package.json` - API server dependencies
- [x] `server/tsconfig.json` - TypeScript config
- [x] `server/.env.example` - Environment variable template
- [x] Build script: `npm run build`
- [x] Start script: `npm start`

#### Admin Directory
- [x] `admin/package.json` - Admin portal dependencies
- [x] `admin/vite.config.ts` - Vite configuration
- [x] Build script: `npm run build`
- [x] Output directory: `admin/dist`

### 3. Environment Variables

#### Server (.env - Set in Render Dashboard)
- [ ] `DATABASE_URL` - Will be auto-set from database service
- [ ] `JWT_SECRET` - Will be auto-generated
- [ ] `NODE_ENV=production`
- [ ] `PORT=3000`
- [ ] `CORS_ORIGIN` - Frontend URLs
- [ ] `LICENSE_SECRET_SALT` - Optional

#### Client (Build-time variables)
- [ ] `VITE_API_URL` - API endpoint URL

#### Admin (Build-time variables)
- [ ] `VITE_ADMIN_API_URL` - Admin API endpoint URL

### 4. Database Setup
- [x] Migration scripts in `server/migrations/`
- [x] Schema file: `postgresql-schema.sql`
- [x] Migration script: `migrate-to-postgresql.ts`
- [x] Startup migration: `run-migrations-on-startup.ts`
- [x] Admin user creation script

### 5. Build Commands Verification

#### API Server
```bash
cd server && npm install && npm run build
cd server && npm start
```
✅ Verified in `render.yaml`

#### Client App
```bash
npm install && npm run build
```
✅ Verified in `render.yaml`

#### Admin App
```bash
cd admin && npm install && npm run build
```
✅ Verified in `render.yaml`

### 6. File Structure Verification

```
PBooksPro/
├── render.yaml                    ✅ Root deployment config
├── package.json                    ✅ Client app config
├── .gitignore                      ✅ Excludes secrets
├── server/
│   ├── package.json                ✅ Server config
│   ├── tsconfig.json               ✅ TypeScript config
│   ├── api/
│   │   └── index.ts                ✅ Server entry point
│   ├── migrations/                 ✅ Database migrations
│   └── scripts/                    ✅ Utility scripts
├── admin/
│   ├── package.json                ✅ Admin config
│   ├── vite.config.ts              ✅ Build config
│   └── src/                        ✅ Admin source code
└── components/                     ✅ Client app source
```

## 🚀 Deployment Steps

### Step 1: Push to GitHub
```bash
# Verify what will be committed
git status

# Ensure .env files are NOT included
git ls-files | grep -E "\.env$"

# Commit and push
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

### Step 2: Connect to Render

1. **Go to Render Dashboard**
   - Visit https://dashboard.render.com
   - Sign in or create account

2. **Create Blueprint**
   - Click "New +" → "Blueprint"
   - Connect GitHub account (if not connected)
   - Select repository: `PBooksPro`
   - Render will detect `render.yaml`
   - Click "Apply"

3. **Monitor Deployment**
   - Watch build logs for each service
   - Check for errors
   - Verify all 4 services are created:
     - ✅ PostgreSQL Database
     - ✅ API Server
     - ✅ Client Static Site
     - ✅ Admin Static Site

### Step 3: Verify Deployment

#### Check API Server
```bash
# Health check
curl https://pbookspro-api.onrender.com/health

# Expected: {"status":"ok",...}
```

#### Check Admin Login
```bash
curl -X POST https://pbookspro-api.onrender.com/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Admin","password":"admin123"}'

# Expected: JWT token
```

#### Check Database
- Go to Render Dashboard → Database
- Click "Connect" → "psql"
- Run: `\dt` to see tables
- Should show: `admin_users`, `tenants`, `accounts`, etc.

#### Check Static Sites
- Visit: `https://pbookspro-client.onrender.com`
- Visit: `https://pbookspro-admin.onrender.com`
- Should load without errors

## 🔧 Troubleshooting

### Build Fails

**Check:**
- [ ] All dependencies in package.json
- [ ] TypeScript compilation errors
- [ ] Node.js version compatibility
- [ ] Build logs in Render dashboard

**Common Issues:**
- Missing dependencies → Add to package.json
- TypeScript errors → Fix compilation issues
- Path issues → Verify build commands use correct paths

### API Server Won't Start

**Check:**
- [ ] DATABASE_URL is set correctly
- [ ] Database is not paused (free tier)
- [ ] Migrations completed successfully
- [ ] Port 3000 is available

**Common Issues:**
- Database connection fails → Check DATABASE_URL
- Migration errors → Check migration logs
- Port conflicts → Verify PORT environment variable

### Static Sites Not Loading

**Check:**
- [ ] Build completed successfully
- [ ] staticPublishPath is correct
- [ ] Environment variables set for build
- [ ] API URL is correct

**Common Issues:**
- Wrong publish path → Check staticPublishPath in render.yaml
- API URL incorrect → Verify VITE_API_URL
- CORS errors → Check CORS_ORIGIN in API server

## 📋 Post-Deployment Tasks

### Immediate
- [ ] Test admin login (Admin/admin123)
- [ ] Change admin password
- [ ] Test tenant registration
- [ ] Test API endpoints
- [ ] Verify database tables created

### Security
- [ ] Change default admin password
- [ ] Verify JWT_SECRET is set
- [ ] Check CORS_ORIGIN includes correct URLs
- [ ] Review environment variables

### Testing
- [ ] Test all CRUD operations
- [ ] Test authentication flow
- [ ] Test multi-tenant isolation
- [ ] Test license activation
- [ ] Test admin portal features

## 🎯 Success Criteria

Deployment is successful when:

1. ✅ All 4 services are running
2. ✅ API server responds to health check
3. ✅ Admin login works
4. ✅ Database tables are created
5. ✅ Static sites load correctly
6. ✅ No errors in logs
7. ✅ Can create and manage tenants
8. ✅ Can generate licenses

## 📞 Next Steps

After successful deployment:

1. **Update Documentation**
   - Note production URLs
   - Update API documentation
   - Document environment variables

2. **Set Up Monitoring**
   - Enable Render alerts
   - Set up error tracking (optional)
   - Monitor database usage

3. **Backup Strategy**
   - Set up database backups
   - Document restore process
   - Test backup restoration

4. **Performance Optimization**
   - Monitor response times
   - Optimize database queries
   - Enable caching if needed

## 🔗 Quick Links

- **Render Dashboard**: https://dashboard.render.com
- **Your Services**: https://dashboard.render.com/web
- **Database**: https://dashboard.render.com/databases
- **Documentation**: See `DEPLOYMENT_GUIDE.md` and `RENDER_DEPLOYMENT_STEPS.md`

