# PBooksPro Backend API Server

Backend API server for PBooksPro multi-tenant application.

## Features

- Multi-tenant architecture with Row Level Security
- License management and validation
- JWT-based authentication
- PostgreSQL database
- RESTful API endpoints
- Admin authentication and management

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/pbookspro
JWT_SECRET=your-super-secret-jwt-key
LICENSE_SECRET_SALT=PBOOKSPRO_SECURE_SALT_2024
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
```

3. Run database migration:
```bash
npm run migrate
```

4. Start development server:
```bash
npm run dev
```

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run migrate` - Run database migration
- `npm run seed-demo` - Seed the demo organization (Demo@pbookspro.com, tenant_1772214936191_179a9196) with ~20 records per area: contacts, vendors, projects, rentals, invoices, bills, transactions, etc. Set DATABASE_URL in .env (e.g. staging).
- `npm run seed-demo:production` - Same as seed-demo but for **production**: uses `server/.env.production` for DATABASE_URL. Create `.env.production` from `.env.production.example` with your production DB URL, then run from the server folder. Only seeds tenant `tenant_1772214936191_179a9196`.

## API Endpoints

### Public
- `GET /health` - Health check
- `POST /api/auth/login` - User login
- `POST /api/auth/register-tenant` - Tenant registration

### Protected (Require Tenant Context)
- `GET /api/tenants/me` - Get tenant info
- `GET /api/tenants/license-status` - Check license status
- `POST /api/tenants/activate-license` - Activate license
- `GET /api/transactions` - List transactions
- `POST /api/transactions` - Create transaction
- ... (all data endpoints)

### Admin (Require Admin Auth)
- `POST /api/admin/auth/login` - Admin login
- `GET /api/admin/tenants` - List tenants
- `POST /api/admin/licenses/generate` - Generate license
- `GET /api/admin/stats/dashboard` - Dashboard stats

## Default Admin Credentials

- Username: `admin`
- Password: `admin123`

**⚠️ Change this immediately after first login!**

## License Management

The server handles:
- Free 30-day trial for new tenants
- License key generation
- License validation
- License expiry checking
- License renewal

## Multi-Tenant Security

- Row Level Security (RLS) ensures data isolation
- All queries automatically filtered by tenant_id
- JWT tokens include tenant context
- Middleware validates tenant access

