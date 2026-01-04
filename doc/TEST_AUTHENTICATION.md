# Testing Authentication Guide

## Prerequisites

1. **Backend API Server** must be running on `http://localhost:3000`
   - If not running, start it: `cd server && npm run dev`

2. **Client App** must be running
   - Start it: `npm run dev` (from root directory)

3. **PostgreSQL Database** must be running and migrated
   - Ensure migration is complete: `cd server && npm run migrate`
   - Ensure admin user exists: `cd server && npm run create-admin`

## Testing Steps

### Test 1: Register a New Tenant (Free Trial)

1. **Open the client app** in your browser (usually `http://localhost:5173`)

2. **You should see the Cloud Login Page** with:
   - Tenant lookup/search field
   - Username and password fields
   - "Register New Organization" button

3. **Click "Register New Organization (Free Trial)"**

4. **Fill in the registration form:**
   - Company Name: `Test Company`
   - Email: `test@example.com`
   - Phone: `+1234567890` (optional)
   - Address: `123 Test St` (optional)
   - Admin Name: `Test Admin`
   - Admin Username: `testadmin`
   - Admin Password: `test123`

5. **Click "Register & Start Free Trial"**

6. **Expected Result:**
   - Registration succeeds
   - You should see a success message
   - You're redirected back to login page
   - The tenant now has a 30-day free trial

### Test 2: Lookup Tenant by Email

1. **On the login page**, enter your email in the "Find Your Organization" field:
   - Email: `test@example.com`

2. **Click "Search"**

3. **Expected Result:**
   - Tenant appears in the results
   - Click on it to select
   - Tenant ID is automatically filled

### Test 3: Login with Registered Tenant

1. **After selecting tenant** (or manually entering tenant ID), enter:
   - Username: `testadmin`
   - Password: `test123`

2. **Click "Sign In"**

3. **Expected Result:**
   - Login succeeds
   - You're redirected to the main app
   - Authentication token is stored in localStorage

### Test 4: Direct Tenant ID Login

1. **On the login page**, scroll to "Or enter Tenant ID directly"

2. **Enter the tenant ID** (you can get it from the admin portal or database)

3. **Enter username and password**

4. **Click "Sign In"**

5. **Expected Result:**
   - Login succeeds if credentials are correct

### Test 5: Activate License Key

1. **On the login page**, click "Activate License Key"

2. **Enter a license key** (generate one from admin portal first)

3. **Click "Activate License"**

4. **Expected Result:**
   - License activates successfully
   - License status updates
   - You can return to login

### Test 6: Check License Status

1. **After logging in**, the app should check license status automatically

2. **If trial is active**, you should see the main app

3. **If license expired**, you should see a license lock screen

## Testing via API Directly

You can also test the authentication endpoints directly using PowerShell or curl:

### Register Tenant (PowerShell)

```powershell
$body = @{
    companyName = "Test Company"
    email = "test@example.com"
    adminUsername = "testadmin"
    adminPassword = "test123"
    adminName = "Test Admin"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/register-tenant" -Method Post -Body $body -ContentType "application/json"
$response | ConvertTo-Json
```

### Lookup Tenant (PowerShell)

```powershell
$body = @{
    email = "test@example.com"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/lookup-tenant" -Method Post -Body $body -ContentType "application/json"
$response | ConvertTo-Json
```

### Login (PowerShell)

```powershell
$body = @{
    username = "testadmin"
    password = "test123"
    tenantId = "tenant_xxxxx"  # Replace with actual tenant ID
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method Post -Body $body -ContentType "application/json"
$response | ConvertTo-Json

# Save the token for future requests
$token = $response.token
$tenantId = $response.tenant.id
```

### Check License Status (PowerShell)

```powershell
$headers = @{
    "Authorization" = "Bearer $token"
    "X-Tenant-ID" = $tenantId
}

$response = Invoke-RestMethod -Uri "http://localhost:3000/api/tenants/license-status" -Method Get -Headers $headers
$response | ConvertTo-Json
```

## Troubleshooting

### Issue: "Network error: Unable to connect to server"

**Solution:**
- Make sure backend API is running on port 3000
- Check `server/.env` has correct `DATABASE_URL`
- Verify PostgreSQL is running

### Issue: "Tenant not found" during lookup

**Solution:**
- Make sure tenant was registered successfully
- Check email/company name spelling
- Verify tenant exists in database

### Issue: "Invalid credentials" during login

**Solution:**
- Verify username and password are correct
- Check tenant ID is correct
- Ensure user exists in database for that tenant

### Issue: "License has expired"

**Solution:**
- Register a new tenant (gets 30-day trial)
- Generate and activate a license key from admin portal
- Check license status in admin portal

### Issue: Login page not showing

**Solution:**
- Check browser console for errors (F12)
- Verify `AuthProvider` is in `index.tsx`
- Check that `CloudLoginPage` is imported correctly

## Environment Variables

Make sure you have the API URL set (optional, defaults to `http://localhost:3000`):

Create `.env` file in root directory:
```
VITE_API_URL=http://localhost:3000
```

## Next Steps After Testing

Once authentication is working:

1. **Test tenant registration** - Create multiple tenants
2. **Test license activation** - Generate licenses from admin portal
3. **Test license expiry** - Verify app blocks when license expires
4. **Test multi-tenant isolation** - Verify data is isolated per tenant

## Browser DevTools

Open browser DevTools (F12) to see:
- Network requests to API
- Authentication token in localStorage
- Any console errors
- API response data

## Expected localStorage Items

After successful login, you should see in localStorage:
- `auth_token` - JWT token
- `tenant_id` - Tenant ID

These are automatically set by `AuthContext`.

