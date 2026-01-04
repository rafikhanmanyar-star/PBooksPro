# PBooksPro Cloud Migration Guide

This guide explains how to migrate PBooksPro from a local Electron desktop application to a cloud-hosted multi-tenant web application on Render.

## Architecture Overview

The new architecture consists of:

1. **Backend API Server** (Node.js/Express + PostgreSQL)
   - Handles all data operations
   - Multi-tenant support with Row Level Security
   - License management and validation
   - Authentication and authorization

2. **Client Application** (React)
   - Main application for end users
   - Communicates with backend API
   - Tenant-specific data isolation

3. **Admin Portal** (React)
   - Separate admin application
   - Tenant management
   - License generation and management
   - System statistics

4. **PostgreSQL Database** (Render)
   - Multi-tenant database with RLS
   - All application data
   - License and tenant information

## Setup Instructions

### Prerequisites

- Node.js 18+ installed
- PostgreSQL database (local for development, Render for production)
- Git repository

### Step 1: Install Dependencies

#### Backend Server
```bash
cd server
npm install
```

#### Admin Application
```bash
cd admin
npm install
```

#### Client Application (if updating)
```bash
npm install
```

### Step 2: Database Setup

#### Local Development

1. Create a PostgreSQL database:
   
   **First, install PostgreSQL if you haven't:**
   - **Windows**: Download from https://www.postgresql.org/download/windows/
   - **macOS**: `brew install postgresql@16` or download installer
   - **Linux**: `sudo apt install postgresql postgresql-contrib`
   
   **Then create the database:**
   ```bash
   # Windows (after adding PostgreSQL to PATH)
   createdb -U postgres pbookspro
   
   # macOS/Linux
   createdb -U postgres pbookspro
   ```
   
   **Or using psql:**
   ```bash
   # Connect to PostgreSQL
   psql -U postgres
   
   # Then in psql prompt:
   CREATE DATABASE pbookspro;
   \q
   ```
   
   **📖 For detailed step-by-step instructions, see `POSTGRESQL_SETUP_GUIDE.md`**

2. Set up environment variables in `server/.env`:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/pbookspro
JWT_SECRET=your-super-secret-jwt-key
LICENSE_SECRET_SALT=PBOOKSPRO_SECURE_SALT_2024
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
```

3. Run the migration:
```bash
cd server
npm run migrate
```

This will:
- Create all database tables
- Set up Row Level Security (RLS)
- Create default admin user (username: `admin`, password: `admin123`)

### Step 3: Start Development Servers

#### Terminal 1: Backend API
```bash
cd server
npm run dev
```
Server will run on `http://localhost:3000`

#### Terminal 2: Admin Portal
```bash
cd admin
npm run dev
```
Admin portal will run on `http://localhost:5174`

#### Terminal 3: Client Application (if updating)
```bash
npm run dev
```
Client will run on `http://localhost:5173`

### Step 4: Access Applications

- **Admin Portal**: http://localhost:5174
  - Login: `admin` / `admin123`
- **API Health Check**: http://localhost:3000/health
- **Client Application**: http://localhost:5173

## Deployment to Render

### Step 1: Prepare Repository

1. Ensure all code is committed to Git
2. Push to GitHub/GitLab/Bitbucket

### Step 2: Create Render Services

#### Option A: Using render.yaml (Recommended)

1. Connect your repository to Render
2. Render will automatically detect `render.yaml`
3. It will create all services:
   - PostgreSQL database
   - Backend API
   - Client application (static)
   - Admin portal (static)

#### Option B: Manual Setup

1. **Create PostgreSQL Database**
   - New → PostgreSQL
   - Name: `pbookspro-database`
   - Plan: Starter

2. **Create Backend API**
   - New → Web Service
   - Connect your repository
   - Name: `pbookspro-api`
   - Environment: Node
   - Build Command: `cd server && npm install && npm run build`
   - Start Command: `cd server && npm start`
   - Add Environment Variables:
     - `DATABASE_URL` (from database service)
     - `JWT_SECRET` (generate random string)
     - `LICENSE_SECRET_SALT` (set to `PBOOKSPRO_SECURE_SALT_2024`)
     - `NODE_ENV=production`
     - `PORT=3000`
     - `CORS_ORIGIN` (your client and admin URLs)

3. **Create Client Application**
   - New → Static Site
   - Connect your repository
   - Name: `pbookspro-client`
   - Build Command: `npm install && npm run build`
   - Publish Directory: `dist`
   - Add Environment Variable:
     - `VITE_API_URL` (your API URL)

4. **Create Admin Portal**
   - New → Static Site
   - Connect your repository
   - Name: `pbookspro-admin`
   - Build Command: `cd admin && npm install && npm run build`
   - Publish Directory: `admin/dist`
   - Add Environment Variable:
     - `VITE_ADMIN_API_URL` (your API URL + `/api/admin`)

### Step 3: Run Database Migration

After the database is created, run the migration:

1. Get the database connection string from Render dashboard
2. Set it in your local `.env` file
3. Run: `cd server && npm run migrate`

Or use Render's shell:
1. Go to your database service
2. Open "Shell" tab
3. Connect and run the migration script

### Step 4: Verify Deployment

1. Check API health: `https://your-api.onrender.com/health`
2. Access admin portal: `https://your-admin.onrender.com`
3. Login with default credentials: `admin` / `admin123`
4. Change default admin password immediately!

## Multi-Tenant Architecture

### Tenant Registration Flow

1. Client visits client application
2. Clicks "Register" or "Sign Up"
3. Fills in company information
4. System automatically:
   - Creates tenant record
   - Starts 30-day free trial
   - Creates admin user for tenant
   - Returns tenant ID and credentials

### License Management Flow

1. **Free Trial** (30 days)
   - Automatically starts on registration
   - No license key required
   - Full access to application

2. **License Activation**
   - Admin generates license key in admin portal
   - Client receives license key
   - Client enters license key in application
   - System validates and activates license

3. **License Types**
   - **Monthly**: Expires after 1 month
   - **Yearly**: Expires after 1 year
   - **Perpetual**: Never expires

4. **License Renewal**
   - Client can renew expired licenses
   - Admin can generate new licenses
   - System automatically checks license status

### Data Isolation

- All data tables include `tenant_id` column
- Row Level Security (RLS) ensures data isolation
- Each API request includes tenant context via JWT
- Database automatically filters queries by tenant

## Admin Portal Features

### Dashboard
- Total tenants count
- Active/expired license statistics
- License type breakdown
- System usage metrics

### Tenant Management
- View all tenants
- Search and filter tenants
- View tenant details and statistics
- Suspend/activate tenants
- View tenant license history

### License Management
- Generate license keys
- View all licenses
- Filter by status/type
- Revoke licenses
- View license history

## API Endpoints

### Public Endpoints
- `POST /api/auth/login` - User login
- `POST /api/auth/register-tenant` - Tenant registration

### Protected Endpoints (Require Tenant Context)
- `GET /api/tenants/me` - Get current tenant info
- `GET /api/tenants/license-status` - Check license status
- `POST /api/tenants/activate-license` - Activate license
- `GET /api/transactions` - Get transactions
- `POST /api/transactions` - Create transaction
- ... (all data endpoints)

### Admin Endpoints (Require Admin Auth)
- `POST /api/admin/auth/login` - Admin login
- `GET /api/admin/tenants` - List tenants
- `POST /api/admin/licenses/generate` - Generate license
- `GET /api/admin/stats/dashboard` - Dashboard stats

## Security Considerations

1. **Change Default Admin Password**
   - Immediately after first login
   - Use strong password

2. **JWT Secret**
   - Use strong random string
   - Keep it secret
   - Don't commit to repository

3. **License Secret Salt**
   - Keep consistent across environments
   - Don't change after licenses are issued

4. **Database Access**
   - Use connection pooling
   - Enable SSL in production
   - Use environment variables for credentials

5. **CORS Configuration**
   - Only allow specific origins
   - Don't use wildcard in production

## Troubleshooting

### Database Connection Issues
- Check `DATABASE_URL` environment variable
- Verify database is accessible
- Check SSL settings for production

### License Validation Fails
- Verify `LICENSE_SECRET_SALT` matches
- Check license key format
- Ensure tenant_id matches

### CORS Errors
- Add client/admin URLs to `CORS_ORIGIN`
- Check API server logs
- Verify environment variables

### Admin Login Fails
- Verify default admin user exists
- Check database migration ran successfully
- Verify JWT_SECRET is set

## Next Steps

1. **Update Client Application**
   - Replace direct database access with API calls
   - Add authentication flow
   - Update data fetching to use API

2. **Data Migration**
   - Export existing SQLite data
   - Import into PostgreSQL
   - Map to tenant structure

3. **Testing**
   - Test tenant registration
   - Test license activation
   - Test data isolation
   - Test admin portal

4. **Production Deployment**
   - Set up monitoring
   - Configure backups
   - Set up alerts
   - Document procedures

## Support

For issues or questions:
- Check server logs in Render dashboard
- Check database logs
- Review API error responses
- Check browser console for client errors

