# PBooksPro Admin Portal

Admin portal for managing tenants and licenses in PBooksPro.

## Features

- Tenant management
- License generation and management
- System statistics dashboard
- Admin authentication

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file (optional, defaults to localhost):
```env
VITE_ADMIN_API_URL=http://localhost:3000/api/admin
```

3. Start development server:
```bash
npm run dev
```

The admin portal will be available at `http://localhost:5174`

## Default Login

- Username: `admin`
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

