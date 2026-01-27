# Quick Local Testing Guide

## 🎯 Fastest Way: Local Frontend → Render API

### Step 1: Update CORS on Render (One Time)

1. Go to: https://dashboard.render.com
2. Click your API service (`pbookspro-api`)
3. Go to **Environment** tab
4. Find `CORS_ORIGIN`
5. Add `http://localhost:5173,http://localhost:5174` to the value:
   ```
   https://pbookspro-client.onrender.com,https://pbookspro-admin.onrender.com,http://localhost:5173,http://localhost:5174
   ```
6. Click **Save Changes**
7. Wait for service to restart (~30 seconds)

### Step 2: Create Environment Files

**In PowerShell:**

```powershell
# Navigate to project
cd "H:\AntiGravity projects\V1.1.3\MyProjectBooks"

# Create client .env
@"
VITE_API_URL=https://pbookspro-api.onrender.com/api
"@ | Out-File -FilePath ".env" -Encoding UTF8

# Create admin .env
@"
VITE_ADMIN_API_URL=https://pbookspro-api.onrender.com/api/admin
"@ | Out-File -FilePath "admin\.env" -Encoding UTF8
```

### Step 3: Start Development Servers

**Terminal 1 - Client:**
```powershell
npm run dev
```
Opens at: `http://localhost:5173`

**Terminal 2 - Admin:**
```powershell
cd admin
npm run dev
```
Opens at: `http://localhost:5174`

### Step 4: Test

1. **Client App:**
   - Open: http://localhost:5173
   - Register a tenant or login
   - All data goes to Render API/Database

2. **Admin App:**
   - Open: http://localhost:5174
   - Login: `Admin` / `admin123`
   - All admin operations use Render API

## ✅ Done!

Your local apps are now connected to Render API and database.

---

## 🔄 Alternative: Local Server + Render Database

If you want to test server code changes:

### Step 1: Get Database URL

1. Render Dashboard → Database → Connections
2. Copy **External Database URL**

### Step 2: Create Server .env

```powershell
cd server

@"
DATABASE_URL=your-external-database-url-here
JWT_SECRET=local-dev-secret-key
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
LICENSE_SECRET_SALT=PBOOKSPRO_SECURE_SALT_2024
"@ | Out-File -FilePath ".env" -Encoding UTF8
```

### Step 3: Update Frontend .env Files

```powershell
# Client
@"
VITE_API_URL=http://localhost:3000/api
"@ | Out-File -FilePath ".env" -Encoding UTF8

# Admin
@"
VITE_ADMIN_API_URL=http://localhost:3000/api/admin
"@ | Out-File -FilePath "admin\.env" -Encoding UTF8
```

### Step 4: Start All Services

**Terminal 1 - Server:**
```powershell
cd server
npm run dev
```

**Terminal 2 - Client:**
```powershell
npm run dev
```

**Terminal 3 - Admin:**
```powershell
cd admin
npm run dev
```

---

## 🚨 Troubleshooting

### CORS Error?
- Update `CORS_ORIGIN` in Render API environment
- Or set it in `server/.env` if using local server

### Can't Connect to Database?
- Use **External Database URL** (not Internal)
- Check database is not paused
- Verify SSL is enabled

### Environment Variables Not Working?
- Restart dev server after creating `.env`
- Check file is in correct directory
- Verify variable names start with `VITE_` for frontend

---

See `LOCAL_TESTING_WITH_RENDER.md` for detailed guide.

