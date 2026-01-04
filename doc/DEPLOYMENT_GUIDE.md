# Deployment Guide for Render Cloud

This guide covers deploying PBooksPro to Render cloud platform.

## Prerequisites

1. Render account (https://render.com)
2. PostgreSQL database (can be created on Render)
3. GitHub repository (for automatic deployments)

## Deployment Steps

### 1. Database Setup

#### Create PostgreSQL Database on Render

1. Go to Render Dashboard → New → PostgreSQL
2. Configure:
   - **Name**: `pbookspro-db` (or your preferred name)
   - **Database**: `pbookspro`
   - **User**: Auto-generated
   - **Region**: Choose closest to your users
   - **PostgreSQL Version**: 15 or later
   - **Plan**: Free tier (for testing) or paid (for production)

3. After creation, note the **Internal Database URL** and **External Database URL**

#### Run Database Migrations

The database schema will be automatically created when the API server starts, but you can also run migrations manually:

```bash
# Set DATABASE_URL environment variable
export DATABASE_URL="postgresql://user:password@host:port/database"

# Run migration
cd server
npm run migrate
```

### 2. API Server Deployment

#### Option A: Using render.yaml (Recommended)

1. Ensure `render.yaml` is in your repository root
2. Connect your GitHub repository to Render
3. Render will automatically detect and deploy using the configuration

#### Option B: Manual Setup

1. Go to Render Dashboard → New → Web Service
2. Connect your GitHub repository
3. Configure:
   - **Name**: `pbookspro-api`
   - **Environment**: Node
   - **Root Directory**: `server`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Free tier (for testing) or paid (for production)

#### Environment Variables

Set these in Render Dashboard → Environment:

```env
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# JWT Secret (generate a strong random string)
JWT_SECRET=your-super-secret-jwt-key-here

# CORS (comma-separated list of allowed origins)
CORS_ORIGIN=https://your-frontend-domain.com,http://localhost:5173

# Node Environment
NODE_ENV=production

# Port (Render sets this automatically, but you can override)
PORT=3000
```

**Important**: Generate a strong JWT_SECRET:
```bash
# On Linux/Mac
openssl rand -base64 32

# Or use an online generator
```

### 3. Create Admin User

After deployment, create the admin user:

1. SSH into your Render service (or use Render Shell)
2. Run:
```bash
cd server
npm run reset-admin
```

Or use the API directly:
```bash
curl -X POST https://your-api-url.onrender.com/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Admin","password":"admin123"}'
```

**⚠️ IMPORTANT**: Change the default password immediately after first login!

### 4. Frontend Configuration

Update your frontend to point to the API:

1. Set the API URL in your frontend environment:
   ```env
   VITE_API_URL=https://your-api-url.onrender.com
   ```

2. For admin portal:
   ```env
   VITE_ADMIN_API_URL=https://your-api-url.onrender.com/api/admin
   ```

### 5. Database Migration from SQLite

If you have existing SQLite data to migrate:

1. Export data from SQLite (use export tools in the app)
2. Use the migration script (if available) or import via API
3. Or manually insert data using SQL scripts

**Note**: A data migration script will be created separately for bulk data import.

## Post-Deployment Checklist

- [ ] Database migrations completed
- [ ] Admin user created and password changed
- [ ] API server is running and accessible
- [ ] CORS configured correctly
- [ ] Environment variables set
- [ ] Test API endpoints:
  - [ ] Health check: `GET /health`
  - [ ] Admin login: `POST /api/admin/auth/login`
  - [ ] Tenant registration: `POST /api/auth/register-tenant`
- [ ] Frontend configured with API URL
- [ ] SSL/HTTPS enabled (automatic on Render)

## Troubleshooting

### Database Connection Issues

- Verify DATABASE_URL is correct
- Check if database is accessible from Render service
- Ensure database is not paused (free tier pauses after inactivity)

### API Not Starting

- Check build logs in Render dashboard
- Verify all environment variables are set
- Check Node.js version compatibility

### CORS Errors

- Verify CORS_ORIGIN includes your frontend domain
- Check that frontend is using correct API URL
- Ensure no trailing slashes in URLs

### Authentication Issues

- Verify JWT_SECRET is set
- Check token expiration settings
- Ensure admin user exists in database

## Monitoring

Render provides:
- **Logs**: View real-time logs in dashboard
- **Metrics**: CPU, memory, request metrics
- **Alerts**: Set up alerts for errors or downtime

## Scaling

For production:
- Upgrade to paid plan for better performance
- Enable auto-scaling based on traffic
- Use connection pooling for database
- Consider Redis for session storage (future)

## Backup Strategy

1. **Database Backups**: Render provides automatic daily backups (paid plans)
2. **Manual Backups**: Export data regularly via API
3. **Version Control**: Keep all code in Git

## Security Best Practices

1. ✅ Use strong JWT_SECRET
2. ✅ Change default admin password
3. ✅ Enable HTTPS (automatic on Render)
4. ✅ Restrict CORS origins
5. ✅ Use environment variables for secrets
6. ✅ Regular security updates
7. ✅ Monitor logs for suspicious activity

## Support

For issues:
1. Check Render logs
2. Review API error logs
3. Check database connection
4. Verify environment variables
5. Test API endpoints directly

