# Create Staging Database Manually in Render

## Issue

The `pbookspro-db-staging` database is not visible in Render Dashboard after applying Blueprint.

## Why This Happens

Render Blueprints sometimes don't automatically create databases, especially if:
- The database plan field is missing or invalid
- Render requires manual confirmation for database creation
- Database resources need separate provisioning

## Solution: Create Database Manually

### Step 1: Create Database in Render Dashboard

1. **Go to Render Dashboard**: https://dashboard.render.com

2. **Click "New +"** (top right corner)

3. **Select "PostgreSQL"**

4. **Configure the database**:
   - **Name**: `pbookspro-db-staging`
   - **Database**: `pbookspro_staging`
   - **User**: `pbookspro_staging`
   - **Region**: Choose same region as your API service (recommended)
   - **Plan**: Select a plan (Free tier if available, or Starter/Standard)
   - **PostgreSQL Version**: Latest stable version

5. **Click "Create Database"**

6. **Wait for database to be created** (1-2 minutes)

### Step 2: Get Database Connection String

1. **Click on the database** (`pbookspro-db-staging`)

2. **Go to "Info" tab** or "Connections" tab

3. **Copy the External Database URL**:
   - Format: `postgresql://user:password@host:5432/database`
   - Should include `.render.com` in hostname
   - Example: `postgresql://pbookspro_staging:xxx@dpg-xxx-a.oregon-postgres.render.com:5432/pbookspro_staging`

### Step 3: Update API Service Environment Variables

1. **Go to your staging API service**: `pbookspro-api-staging`

2. **Go to "Environment" tab**

3. **Find `DATABASE_URL` environment variable**:
   - If it exists: Update it with the External Database URL from Step 2
   - If it doesn't exist: Add it:
     - **Key**: `DATABASE_URL`
     - **Value**: (paste the External Database URL)

4. **Click "Save Changes"**

5. **Service will automatically redeploy**

### Step 4: Verify Database Connection

After the API service redeploys, check the logs:

1. **Go to API service**: `pbookspro-api-staging`

2. **Go to "Logs" tab**

3. **Look for**:
   - `✅ Connected to PostgreSQL database`
   - `✅ Database migrations completed successfully`
   - No connection errors

## Alternative: Link Database in Blueprint

If you want Render to automatically link the database:

1. **Edit your Blueprint** (if possible):
   - Or manually update the service to use `fromDatabase` reference

2. **In Render Dashboard**:
   - Go to `pbookspro-api-staging` service
   - Environment tab
   - Find `DATABASE_URL`
   - Click "Link Database" (if available)
   - Select `pbookspro-db-staging`

## Important Notes

- **External Database URL** must be used (not Internal URL)
- External URL includes full hostname like `.oregon-postgres.render.com`
- Internal URL won't work from Render services
- Database and API service should be in same region for best performance

## Troubleshooting

### Database not showing up in dropdown
- Make sure database is fully created (green status)
- Refresh the page
- Check if you're in the correct Render account/team

### Connection still fails after setting DATABASE_URL
- Verify you copied the External URL (not Internal)
- Check database is in same region as API service
- Verify database service is running (not sleeping)
- Check API service logs for specific error messages

### Migration errors
- Database will be empty initially
- Migrations run automatically on API startup
- Check logs for migration errors
- May need to run migrations manually if auto-migration fails
