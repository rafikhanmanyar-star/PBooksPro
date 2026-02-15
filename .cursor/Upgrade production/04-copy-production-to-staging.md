# Copy Production Database to Staging

Replace all staging data with production data so you can test the staging app with real data.

## Prerequisites

1. **PostgreSQL client tools** (`pg_dump`, `pg_restore`) in your PATH.
   - Windows: `choco install postgresql`
   - Or: https://www.postgresql.org/download/

2. **Environment variables** in `server/.env`:
   - `PRODUCTION_DATABASE_URL` — External URL of production DB (pbookspro-db-Production in Oregon)
   - `STAGING_DATABASE_URL` — External URL of staging DB (pbookspro-db-staging)

   Get these from [Render Dashboard](https://dashboard.render.com/) → each database → Connect → **External Database URL**.

## Run

```powershell
cd server
npm run copy-production-to-staging
```

Or from project root:

```powershell
npm run copy-production-to-staging --prefix server
```

## What it does

1. Dumps production database to a temporary file
2. Drops and recreates the staging schema (wipes all staging data)
3. Restores production data into staging
4. Verifies row counts and cleans up

## After running

Test the staging app at: https://pbookspro-client-staging.onrender.com
