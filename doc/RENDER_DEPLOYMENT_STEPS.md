# Render Deployment Steps

Follow these steps to deploy your application to Render cloud.

## Step 1: Connect GitHub Repository to Render

1. **Go to Render Dashboard**
   - Visit https://dashboard.render.com
   - Sign in or create an account

2. **Create New Blueprint** (if using render.yaml)
   - Click "New +" → "Blueprint"
   - Connect your GitHub account
   - Select your repository: `PBooksPro` (or your repo name)
   - Render will detect `render.yaml` automatically
   - Click "Apply"

3. **OR Create Services Manually**

   If not using Blueprint, create services one by one:

   ### A. Create PostgreSQL Database
   - Click "New +" → "PostgreSQL"
   - Name: `pbookspro-database`
   - Database: `pbookspro`
   - User: `pbookspro_user` (or auto-generated)
   - Region: Choose closest to your users
   - Plan: Starter (or Free for testing)
   - Click "Create Database"
   - **Note the Internal Database URL** (you'll need this)

   ### B. Create API Web Service
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name**: `pbookspro-api`
     - **Environment**: `Node`
     - **Region**: Same as database
     - **Branch**: `main` (or your default branch)
     - **Root Directory**: `server`
     - **Build Command**: `npm install && npm run build`
     - **Start Command**: `npm start`
     - **Plan**: Starter (or Free for testing)
   
   ### C. Set Environment Variables
   In the API service settings, add:
   - `DATABASE_URL` → From database service (Internal Database URL)
   - `JWT_SECRET` → Generate a strong random string
   - `NODE_ENV` → `production`
   - `PORT` → `3000` (or leave default)
   - `CORS_ORIGIN` → Your frontend URLs (comma-separated)

   ### D. Create Frontend Static Site (Optional)
   - Click "New +" → "Static Site"
   - Connect GitHub repository
   - Configure:
     - **Name**: `pbookspro-client`
     - **Root Directory**: (leave empty)
     - **Build Command**: `npm install && npm run build`
     - **Publish Directory**: `dist`
     - **Environment Variables**:
       - `VITE_API_URL` → `https://pbookspro-api.onrender.com/api`

   ### E. Create Admin Portal Static Site (Optional)
   - Click "New +" → "Static Site"
   - Connect GitHub repository
   - Configure:
     - **Name**: `pbookspro-admin`
     - **Root Directory**: `admin`
     - **Build Command**: `npm install && npm run build`
     - **Publish Directory**: `dist`
     - **Environment Variables**:
       - `VITE_ADMIN_API_URL` → `https://pbookspro-api.onrender.com/api/admin`

## Step 2: Monitor Deployment

1. **Watch Build Logs**
   - Go to your service in Render dashboard
   - Click on the service
   - View "Logs" tab
   - Watch for build progress and errors

2. **Check for Errors**
   - Build failures (check package.json, dependencies)
   - Database connection errors (check DATABASE_URL)
   - Port binding errors (check PORT setting)

## Step 3: Verify Deployment

### Test API Endpoints

1. **Health Check**
   ```bash
   curl https://your-api-url.onrender.com/health
   ```
   Should return: `{"status":"ok",...}`

2. **Admin Login**
   ```bash
   curl -X POST https://your-api-url.onrender.com/api/admin/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"Admin","password":"admin123"}'
   ```
   Should return a JWT token

3. **Check Database**
   - Go to Render dashboard → Your database
   - Click "Connect" → "psql"
   - Run: `\dt` to see tables
   - Should show: `admin_users`, `tenants`, `accounts`, etc.

## Step 4: Post-Deployment Tasks

1. **Change Admin Password**
   - Login to admin portal
   - Go to user management
   - Change default password from `admin123`

2. **Test All Features**
   - Create a test tenant
   - Test API endpoints
   - Verify data persistence

3. **Update Frontend URLs**
   - Update frontend to use Render API URL
   - Test end-to-end functionality

## Troubleshooting

### Database Connection Fails

**Error**: `getaddrinfo ENOTFOUND` or connection timeout

**Solution**:
- Use **Internal Database URL** (not External)
- Verify DATABASE_URL format: `postgresql://user:pass@host:port/db`
- Check database is not paused (free tier pauses after inactivity)

### Build Fails

**Error**: `npm install` fails or TypeScript errors

**Solution**:
- Check Node.js version (Render uses latest LTS)
- Verify all dependencies in package.json
- Check for TypeScript compilation errors
- Review build logs for specific errors

### API Not Starting

**Error**: Service crashes on startup

**Solution**:
- Check startup logs
- Verify DATABASE_URL is set
- Check PORT is not conflicting
- Ensure migrations complete successfully

### CORS Errors

**Error**: Frontend can't connect to API

**Solution**:
- Verify CORS_ORIGIN includes your frontend URL
- Check API URL in frontend environment variables
- Ensure no trailing slashes in URLs

## Environment Variables Reference

### Required for API Service:
```env
DATABASE_URL=postgresql://user:pass@host:port/database
JWT_SECRET=your-strong-random-secret
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://your-frontend.onrender.com
```

### Optional:
```env
LICENSE_SECRET_SALT=PBOOKSPRO_SECURE_SALT_2024
```

### For Frontend:
```env
VITE_API_URL=https://your-api.onrender.com/api
```

### For Admin Portal:
```env
VITE_ADMIN_API_URL=https://your-api.onrender.com/api/admin
```

## Next Steps After Deployment

1. ✅ Verify all services are running
2. ✅ Test API endpoints
3. ✅ Create admin user (if not auto-created)
4. ✅ Change default password
5. ✅ Test tenant registration
6. ✅ Test data CRUD operations
7. ✅ Monitor logs for errors
8. ✅ Set up alerts (optional)

## Support Resources

- **Render Docs**: https://render.com/docs
- **PostgreSQL on Render**: https://render.com/docs/databases
- **Node.js on Render**: https://render.com/docs/node
- **Static Sites on Render**: https://render.com/docs/static-sites

