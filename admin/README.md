# PBooksPro Admin Portal

Admin portal for managing tenants and licenses in PBooksPro.

## Features

- Tenant management
- License generation and management
- System statistics dashboard
- Admin authentication

## Setup

1. **Run database migration** (PostgreSQL API server):
   ```bash
   npm run db:migrate:lan
   ```
   This applies `database/migrations/087_admin_portal.sql` (admin_users table + tenant license columns).

2. **Start the API backend** (separate terminal):
   ```bash
   npm run dev:backend
   ```

3. Install admin portal dependencies (first time only):
   ```bash
   npm install --prefix admin
   ```

4. Start the admin portal:
   ```bash
   npm run dev:admin
   ```
   Or from the `admin/` folder: `npm run dev`

The admin portal will be available at `http://localhost:5175` (main PBooks Pro client uses port 5174).

## Default Login

- Username: `Admin`
- Password: `admin123`

**⚠️ Change this immediately after first login!**

## Features

### Dashboard
- View system statistics
- Tenant counts
- License statistics
- Usage metrics

### Tenant Management
- View all tenants
- Search and filter
- View tenant details
- Suspend/activate tenants
- View tenant statistics

### License Management
- Generate license keys
- View all licenses
- Filter by status/type
- Revoke licenses
- View license history

## Build for Production

```bash
npm run build
```

Output will be in `dist/` directory.

## Deployment

The admin portal is a static site that can be deployed to:
- Render (Static Site)
- Netlify
- Vercel
- Any static hosting service

Make sure to set `VITE_ADMIN_API_URL` environment variable to point to your API server.

