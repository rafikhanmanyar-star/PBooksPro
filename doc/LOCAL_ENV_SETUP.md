# Local Environment Setup for Testing

Create these `.env` files for local testing with Render.

## 📁 File Locations

### 1. Client App (Root Directory)

Create `.env` in project root:

```env
# .env (in MyProjectBooks root)
# For testing with Render API:
VITE_API_URL=https://pbookspro-api.onrender.com/api

# OR for testing with local server:
# VITE_API_URL=http://localhost:3000/api
```

### 2. Admin App

Create `admin/.env`:

```env
# admin/.env
# For testing with Render API:
VITE_ADMIN_API_URL=https://pbookspro-api.onrender.com/api/admin

# OR for testing with local server:
# VITE_ADMIN_API_URL=http://localhost:3000/api/admin
```

### 3. Server (If running locally)

Create `server/.env`:

```env
# server/.env
# Get this from Render Dashboard → Database → Connections → External Database URL
DATABASE_URL=postgresql://user:password@dpg-xxxxx-a.oregon-postgres.render.com/database_name

# Local development JWT secret (different from production)
JWT_SECRET=local-development-secret-key-change-this

# Environment
NODE_ENV=development

# Port
PORT=3000

# CORS - Allow local frontend URLs
CORS_ORIGIN=http://localhost:5173,http://localhost:5174

# License secret (same as production or different)
LICENSE_SECRET_SALT=PBOOKSPRO_SECURE_SALT_2024
```

## 🚀 Quick Setup

### Option A: Test Frontend with Render API

1. **Update CORS on Render:**
   - Go to Render Dashboard → API Service → Environment
   - Update `CORS_ORIGIN` to include: `http://localhost:5173,http://localhost:5174`
   - Save (service will restart)

2. **Create `.env` files:**
   ```powershell
   # In project root
   echo "VITE_API_URL=https://pbookspro-api.onrender.com/api" > .env
   
   # In admin directory
   echo "VITE_ADMIN_API_URL=https://pbookspro-api.onrender.com/api/admin" > admin/.env
   ```

3. **Start apps:**
   ```powershell
   # Client
   npm run dev
   
   # Admin (in another terminal)
   cd admin
   npm run dev
   ```

### Option B: Test Everything Locally (Server + Render DB)

1. **Get Database URL from Render:**
   - Render Dashboard → Database → Connections
   - Copy **External Database URL**

2. **Create `server/.env`:**
   ```env
   DATABASE_URL=your-external-database-url-here
   JWT_SECRET=local-dev-secret
   NODE_ENV=development
   PORT=3000
   CORS_ORIGIN=http://localhost:5173,http://localhost:5174
   LICENSE_SECRET_SALT=PBOOKSPRO_SECURE_SALT_2024
   ```

3. **Create frontend `.env` files:**
   ```powershell
   # Client
   echo "VITE_API_URL=http://localhost:3000/api" > .env
   
   # Admin
   echo "VITE_ADMIN_API_URL=http://localhost:3000/api/admin" > admin/.env
   ```

4. **Start everything:**
   ```powershell
   # Terminal 1: Server
   cd server
   npm run dev
   
   # Terminal 2: Client
   npm run dev
   
   # Terminal 3: Admin
   cd admin
   npm run dev
   ```

## ⚠️ Important Notes

1. **Never commit `.env` files** - They're in `.gitignore`
2. **Restart dev server** after changing `.env` files
3. **Use External Database URL** for local connections (not Internal)
4. **Update CORS** on Render if testing frontend with Render API

## 🔍 Verify Setup

After creating `.env` files:

```powershell
# Check client .env
cat .env

# Check admin .env
cat admin/.env

# Check server .env (if using local server)
cat server/.env
```

All should show your configuration values.

