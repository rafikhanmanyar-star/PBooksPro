# Local Testing with Render Database/API

This guide shows how to test your application locally while using the Render database or API.

## 🎯 Two Testing Scenarios

### Scenario 1: Local Frontend → Render API → Render Database
**Best for:** Testing frontend changes with production API

### Scenario 2: Local Server → Render Database
**Best for:** Testing server changes with production database

---

## 📋 Scenario 1: Local Frontend → Render API

Test your local client/admin apps connected to the Render API.

### Step 1: Get Render API URL

After deployment, your API will be at:
```
https://pbookspro-api.onrender.com
```

### Step 2: Update CORS on Render

The Render API needs to allow requests from `localhost`:

1. Go to Render Dashboard → Your API Service
2. Go to **Environment** tab
3. Find `CORS_ORIGIN` variable
4. Update it to include `http://localhost:5173`:
   ```
   https://pbookspro-client.onrender.com,https://pbookspro-admin.onrender.com,http://localhost:5173,http://localhost:5174
   ```
5. Click **Save Changes**
6. Render will automatically restart the service

### Step 3: Create Local Environment Files

#### For Client App (Root Directory)

Create `.env` in project root:

```env
# .env (in project root)
VITE_API_URL=https://pbookspro-api.onrender.com/api
```

#### For Admin App

Create `admin/.env`:

```env
# admin/.env
VITE_ADMIN_API_URL=https://pbookspro-api.onrender.com/api/admin
```

### Step 4: Start Local Development

#### Start Client App
```powershell
# In project root
npm run dev
```

App will run at `http://localhost:5173` and connect to Render API.

#### Start Admin App
```powershell
# In admin directory
cd admin
npm run dev
```

Admin will run at `http://localhost:5174` (or next available port) and connect to Render API.

### Step 5: Test

1. **Client App:**
   - Open: `http://localhost:5173`
   - Register a tenant or login
   - All data operations will use Render API

2. **Admin App:**
   - Open: `http://localhost:5174`
   - Login with: `Admin` / `admin123`
   - All admin operations will use Render API

---

## 📋 Scenario 2: Local Server → Render Database

Test your local server connected to Render database.

### Step 1: Get Database Connection String

1. Go to Render Dashboard → Your Database
2. Go to **Connections** tab
3. Copy the **Internal Database URL** (for Render services) or **External Database URL** (for local connection)

**For local testing, use External Database URL:**
```
postgresql://user:password@dpg-xxxxx-a.oregon-postgres.render.com/database_name
```

### Step 2: Create Server Environment File

Create `server/.env`:

```env
# server/.env
DATABASE_URL=postgresql://user:password@dpg-xxxxx-a.oregon-postgres.render.com/database_name
JWT_SECRET=your-local-jwt-secret-key-here
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
LICENSE_SECRET_SALT=PBOOKSPRO_SECURE_SALT_2024
```

**⚠️ Important:**
- Replace `DATABASE_URL` with your actual Render database URL
- Use a different `JWT_SECRET` for local development
- `CORS_ORIGIN` should include your local frontend URLs

### Step 3: Start Local Server

```powershell
cd server
npm run dev
```

Server will start at `http://localhost:3000` and connect to Render database.

### Step 4: Start Local Frontend

#### Client App
Create `.env` in project root:
```env
VITE_API_URL=http://localhost:3000/api
```

Then start:
```powershell
npm run dev
```

#### Admin App
Create `admin/.env`:
```env
VITE_ADMIN_API_URL=http://localhost:3000/api/admin
```

Then start:
```powershell
cd admin
npm run dev
```

### Step 5: Test

- Client: `http://localhost:5173` → Local API → Render Database
- Admin: `http://localhost:5174` → Local API → Render Database
- API: `http://localhost:3000` → Render Database

---

## 🔧 Quick Setup Scripts

### For Scenario 1 (Local Frontend → Render API)

Create these files:

**`.env` (root):**
```env
VITE_API_URL=https://pbookspro-api.onrender.com/api
```

**`admin/.env`:**
```env
VITE_ADMIN_API_URL=https://pbookspro-api.onrender.com/api/admin
```

### For Scenario 2 (Local Server → Render DB)

**`server/.env`:**
```env
DATABASE_URL=your-render-database-url-here
JWT_SECRET=local-dev-secret-key
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
LICENSE_SECRET_SALT=PBOOKSPRO_SECURE_SALT_2024
```

**`.env` (root):**
```env
VITE_API_URL=http://localhost:3000/api
```

**`admin/.env`:**
```env
VITE_ADMIN_API_URL=http://localhost:3000/api/admin
```

---

## 🚨 Important Notes

### CORS Configuration

**For Scenario 1:**
- Update `CORS_ORIGIN` in Render API service to include `http://localhost:5173`
- Render service will restart automatically

**For Scenario 2:**
- Set `CORS_ORIGIN` in `server/.env` to include your local frontend URLs
- No Render changes needed

### Database Access

**External Database URL:**
- Use for local development
- Accessible from your computer
- Requires SSL connection

**Internal Database URL:**
- Only works from within Render network
- Use for Render services only
- Faster connection

### Environment Variables

- **Vite variables** (VITE_*) must be set at build time
- **Server variables** can be set at runtime
- Restart dev server after changing `.env` files

---

## 🧪 Testing Checklist

### Scenario 1 Testing
- [ ] CORS updated on Render API
- [ ] `.env` files created for client/admin
- [ ] Client app connects to Render API
- [ ] Admin app connects to Render API
- [ ] Can login/register
- [ ] CRUD operations work
- [ ] Data persists in Render database

### Scenario 2 Testing
- [ ] `server/.env` configured with Render DB URL
- [ ] Local server starts successfully
- [ ] Server connects to Render database
- [ ] Client/admin `.env` point to local API
- [ ] Can login/register
- [ ] CRUD operations work
- [ ] Data persists in Render database

---

## 🔍 Troubleshooting

### CORS Errors

**Error:** `Access to fetch at '...' from origin 'http://localhost:5173' has been blocked by CORS policy`

**Solution:**
- Update `CORS_ORIGIN` in Render API to include `http://localhost:5173`
- Or set `CORS_ORIGIN` in `server/.env` if using local server

### Database Connection Errors

**Error:** `getaddrinfo ENOTFOUND` or connection timeout

**Solution:**
- Use **External Database URL** (not Internal)
- Check database is not paused (free tier)
- Verify SSL is enabled in connection string

### Environment Variables Not Working

**Issue:** Changes to `.env` not taking effect

**Solution:**
- Restart dev server after changing `.env`
- For Vite, ensure variable starts with `VITE_`
- Check `.env` file is in correct directory

### API Not Responding

**Error:** `Failed to fetch` or network error

**Solution:**
- Verify API URL is correct
- Check API service is running on Render
- Check browser console for specific errors
- Verify CORS is configured correctly

---

## 📝 Quick Reference

### Environment Files Location

```
MyProjectBooks/
├── .env                    # Client app (VITE_API_URL)
├── server/
│   └── .env                # Server (DATABASE_URL, etc.)
└── admin/
    └── .env                # Admin app (VITE_ADMIN_API_URL)
```

### Default URLs

- **Client Dev:** `http://localhost:5173`
- **Admin Dev:** `http://localhost:5174`
- **Local API:** `http://localhost:3000`
- **Render API:** `https://pbookspro-api.onrender.com`

### Commands

```powershell
# Start client (root)
npm run dev

# Start admin
cd admin && npm run dev

# Start server
cd server && npm run dev
```

---

## ✅ Recommended Workflow

1. **Development:** Use Scenario 2 (local server + Render DB)
   - Faster iteration
   - Can debug server code
   - Uses production database

2. **Frontend Testing:** Use Scenario 1 (local frontend + Render API)
   - Test against production API
   - Verify API compatibility
   - No server code changes needed

3. **Production:** Everything on Render
   - Full deployment
   - All services connected
   - Production environment

---

Ready to test! Choose your scenario and follow the steps above.

