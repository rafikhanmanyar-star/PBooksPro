# Testing the Server in Browser

## Quick Access

### 1. Health Check (Test if server is running)
Open in browser:
```
http://localhost:3000/health
```

You should see:
```json
{
  "status": "ok",
  "timestamp": "2024-...",
  "database": "connected"
}
```

### 2. API Endpoints

#### Public Endpoints (No authentication required)

**Health Check:**
- `GET http://localhost:3000/health`

**Tenant Registration:**
- `POST http://localhost:3000/api/tenants/register`
  - Body: JSON with companyName, email, adminUsername, adminPassword, etc.

**Admin Login:**
- `POST http://localhost:3000/api/admin/auth/login`
  - Body: `{ "username": "admin", "password": "admin123" }`

### 3. Using Browser

**For GET requests**, you can directly open in browser:
- Health check: `http://localhost:3000/health`

**For POST requests**, you need to use:
- Browser DevTools (F12) → Console → Use `fetch()`
- Or use a tool like Postman, Insomnia, or Thunder Client (VS Code extension)

### 4. Test in Browser Console

Open browser DevTools (F12) and try:

```javascript
// Test health endpoint
fetch('http://localhost:3000/health')
  .then(res => res.json())
  .then(data => console.log('Health:', data));

// Test admin login
fetch('http://localhost:3000/api/admin/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'admin',
    password: 'admin123'
  })
})
  .then(res => res.json())
  .then(data => console.log('Login:', data));
```

## Admin Portal

The admin portal runs separately. To access it:

1. **Start Admin Portal:**
   ```powershell
   cd admin
   npm run dev
   ```

2. **Open in browser:**
   ```
   http://localhost:5174
   ```

3. **Login:**
   - Username: `admin`
   - Password: `admin123`

## Client Application

The main client application (when updated to use API):
```
http://localhost:5173
```

## Quick Test Commands

### Using PowerShell (Invoke-WebRequest)

```powershell
# Test health endpoint
Invoke-WebRequest -Uri "http://localhost:3000/health" | Select-Object -ExpandProperty Content

# Test with JSON response
(Invoke-WebRequest -Uri "http://localhost:3000/health").Content | ConvertFrom-Json
```

### Using curl (if installed)

```bash
# Health check
curl http://localhost:3000/health

# Admin login
curl -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

## Available Endpoints

### Public
- `GET /health` - Health check
- `POST /api/auth/login` - User login
- `POST /api/tenants/register` - Register new tenant

### Admin (Require admin token)
- `POST /api/admin/auth/login` - Admin login
- `GET /api/admin/tenants` - List tenants
- `POST /api/admin/licenses/generate` - Generate license
- `GET /api/admin/stats/dashboard` - Dashboard stats

### Protected (Require user token)
- `GET /api/tenants/me` - Get tenant info
- `GET /api/tenants/license-status` - Check license
- `GET /api/transactions` - List transactions
- `GET /api/accounts` - List accounts
- `GET /api/contacts` - List contacts

## Next Steps

1. ✅ Server is running on `http://localhost:3000`
2. ✅ Test health endpoint in browser
3. **Start admin portal**: `cd admin && npm run dev`
4. **Access admin at**: `http://localhost:5174`
5. **Run database migration**: `cd server && npm run migrate`

