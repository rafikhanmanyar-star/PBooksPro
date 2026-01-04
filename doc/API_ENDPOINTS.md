# PBooksPro API Endpoints

## Base URL
```
http://localhost:3000
```

## Available Endpoints

### Root & Health
- `GET /` - API information
- `GET /health` - Health check

### Public Endpoints (No Authentication)

#### Authentication
- `POST /api/auth/login` - User login
  ```json
  {
    "username": "user",
    "password": "pass",
    "tenantId": "tenant_123"
  }
  ```

- `POST /api/auth/register-tenant` - Register new tenant (starts free trial)
  ```json
  {
    "companyName": "My Company",
    "email": "company@example.com",
    "adminUsername": "admin",
    "adminPassword": "password123",
    "adminName": "Admin User"
  }
  ```

- `POST /api/tenants/register` - Alternative tenant registration endpoint

### Admin Endpoints (Require Admin Token)

**First, login to get admin token:**
- `POST /api/admin/auth/login`
  ```json
  {
    "username": "admin",
    "password": "admin123"
  }
  ```
  Returns: `{ "token": "...", "admin": {...} }`

**Then use token in Authorization header:**
```
Authorization: Bearer <token>
```

#### Admin Routes
- `GET /api/admin/auth/me` - Get current admin info
- `GET /api/admin/tenants` - List all tenants
- `GET /api/admin/tenants/:id` - Get tenant details
- `GET /api/admin/tenants/:id/stats` - Get tenant statistics
- `POST /api/admin/tenants/:id/suspend` - Suspend tenant
- `POST /api/admin/tenants/:id/activate` - Activate tenant
- `GET /api/admin/licenses` - List all licenses
- `POST /api/admin/licenses/generate` - Generate license key
- `GET /api/admin/licenses/tenant/:tenantId/history` - Get license history
- `POST /api/admin/licenses/:id/revoke` - Revoke license
- `GET /api/admin/stats/dashboard` - Dashboard statistics

### Protected Endpoints (Require User Token)

**First, login to get user token:**
- `POST /api/auth/login` (with tenantId)

**Then use token in Authorization header:**
```
Authorization: Bearer <token>
```

#### Tenant Routes
- `GET /api/tenants/me` - Get current tenant info
- `GET /api/tenants/license-status` - Check license status
- `POST /api/tenants/activate-license` - Activate license key
- `POST /api/tenants/renew-license` - Renew license

#### Data Routes
- `GET /api/transactions` - List transactions
- `POST /api/transactions` - Create transaction
- `GET /api/transactions/:id` - Get transaction
- `PUT /api/transactions/:id` - Update transaction
- `DELETE /api/transactions/:id` - Delete transaction

- `GET /api/accounts` - List accounts
- `POST /api/accounts` - Create account
- `PUT /api/accounts/:id` - Update account
- `DELETE /api/accounts/:id` - Delete account

- `GET /api/contacts` - List contacts
- `POST /api/contacts` - Create contact
- `PUT /api/contacts/:id` - Update contact
- `DELETE /api/contacts/:id` - Delete contact

## Testing in Browser

### Direct Browser Access (GET requests only)
- `http://localhost:3000/` - API info
- `http://localhost:3000/health` - Health check

### Using Browser Console (F12)
```javascript
// Test health
fetch('http://localhost:3000/health')
  .then(r => r.json())
  .then(console.log);

// Admin login
fetch('http://localhost:3000/api/admin/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'admin',
    password: 'admin123'
  })
})
  .then(r => r.json())
  .then(data => {
    console.log('Token:', data.token);
    localStorage.setItem('admin_token', data.token);
  });
```

## Admin Portal

The admin portal is a separate application:
- **URL**: `http://localhost:5174`
- **Login**: admin / admin123

The admin portal handles authentication and API calls automatically.

