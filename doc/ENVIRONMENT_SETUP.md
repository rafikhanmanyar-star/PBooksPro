# Environment Setup Documentation

## Overview

PBooksPro uses separate staging and production environments deployed on Render.com. This document explains the environment structure, configuration, and deployment workflow.

## Environment Architecture

```
Production (main branch)          Staging (staging branch)
├── pbookspro-api                 ├── pbookspro-api-staging
├── pbookspro-client              ├── pbookspro-client-staging
├── pbookspro-admin               ├── pbookspro-admin-staging
└── pbookspro-db                  └── pbookspro-db-staging
```

## Environment Configuration

### Production Environment

- **Branch**: `main`
- **Database**: `pbookspro-db` (PostgreSQL)
- **API URL**: `https://pbookspro-api.onrender.com`
- **Client URL**: `https://pbookspro-client.onrender.com`
- **Admin URL**: `https://pbookspro-admin.onrender.com`
- **Node Environment**: `production`

### Staging Environment

- **Branch**: `staging`
- **Database**: `pbookspro-db-staging` (PostgreSQL)
- **API URL**: `https://pbookspro-api-staging.onrender.com`
- **Client URL**: `https://pbookspro-client-staging.onrender.com`
- **Admin URL**: `https://pbookspro-admin-staging.onrender.com`
- **Node Environment**: `staging`

## Environment Variables

### API Server Environment Variables

| Variable | Production | Staging |
|----------|------------|---------|
| `DATABASE_URL` | From `pbookspro-db` | From `pbookspro-db-staging` |
| `JWT_SECRET` | Auto-generated | Auto-generated (separate) |
| `LICENSE_SECRET_SALT` | `PBOOKSPRO_SECURE_SALT_2024` | `PBOOKSPRO_SECURE_SALT_2024_STAGING` |
| `NODE_ENV` | `production` | `staging` |
| `PORT` | `3000` | `3000` |
| `CORS_ORIGIN` | Production URLs + localhost | Staging URLs + localhost |
| `API_URL` | `https://pbookspro-api.onrender.com` | `https://pbookspro-api-staging.onrender.com` |
| `SERVER_URL` | `https://pbookspro-api.onrender.com` | `https://pbookspro-api-staging.onrender.com` |
| `CLIENT_URL` | `https://pbookspro-client.onrender.com` | `https://pbookspro-client-staging.onrender.com` |

### Client Application Environment Variables

| Variable | Production | Staging |
|----------|------------|---------|
| `VITE_API_URL` | `https://pbookspro-api.onrender.com/api` | `https://pbookspro-api-staging.onrender.com/api` |

### Admin Application Environment Variables

| Variable | Production | Staging |
|----------|------------|---------|
| `VITE_ADMIN_API_URL` | `https://pbookspro-api.onrender.com/api/admin` | `https://pbookspro-api-staging.onrender.com/api/admin` |

## Deployment Workflow

### Staging Deployment

1. Push changes to `staging` branch:
   ```bash
   git checkout staging
   git add .
   git commit -m "Your commit message"
   git push origin staging
   ```

2. Render automatically detects the push and:
   - Builds and deploys `pbookspro-api-staging`
   - Builds and deploys `pbookspro-client-staging`
   - Builds and deploys `pbookspro-admin-staging`
   - All services use the staging database

3. Test the staging environment:
   - Visit `https://pbookspro-client-staging.onrender.com`
   - Verify all functionality works as expected
   - Check logs in Render dashboard for any errors

### Production Deployment

1. Merge staging to main:
   ```bash
   git checkout main
   git merge staging
   git push origin main
   ```

2. Render automatically detects the push and:
   - Builds and deploys `pbookspro-api` (production)
   - Builds and deploys `pbookspro-client` (production)
   - Builds and deploys `pbookspro-admin` (production)
   - All services use the production database

3. Monitor production deployment:
   - Check Render dashboard for deployment status
   - Monitor application logs
   - Verify production URLs are working

## Database Isolation

- **Staging database** (`pbookspro-db-staging`): Separate PostgreSQL database for testing
- **Production database** (`pbookspro-db`): Production PostgreSQL database with live data
- Databases are completely isolated - changes in staging do not affect production

## CORS Configuration

CORS is configured to allow:
- Production URLs (production services)
- Staging URLs (staging services)
- Localhost URLs for local development (`http://localhost:5173`, `http://localhost:5174`)

## Important Notes

1. **Database Migrations**: Staging database starts empty. Run migrations manually or configure auto-migration on first deployment.

2. **JWT Secrets**: Production and staging use separate, auto-generated JWT secrets for security isolation.

3. **Service Sleep**: Staging services may go to sleep after inactivity (Render free tier behavior). First request may be slower.

4. **Environment Variables**: Environment variables are injected at build time for static sites (client/admin). Changes require rebuild.

5. **Version Management**: Application version is injected from `package.json` at build time for both client and server.

## Local Development

For local development with staging/production APIs, see:
- `doc/LOCAL_ENV_SETUP.md` - Local environment setup
- `doc/LOCAL_TESTING_WITH_RENDER.md` - Testing with Render APIs

## Troubleshooting

### Staging services not deploying
- Check that `staging` branch exists
- Verify `render.yaml` has correct branch configuration
- Check Render dashboard for deployment errors

### Database connection errors
- Verify `DATABASE_URL` is set correctly in Render dashboard
- Ensure database service is running
- Check CORS settings if frontend can't connect to API

### Environment variable not working
- Static sites (client/admin) require rebuild after env var changes
- Verify env var name starts with `VITE_` for Vite apps
- Check Render dashboard environment variables section
