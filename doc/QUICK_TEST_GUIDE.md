# Quick Test Guide - Admin Portal

## ✅ Current Status
- Backend API: Running on `http://localhost:3000`
- Admin Portal: Running on `http://localhost:5174`
- Database: PostgreSQL connected
- Admin User: Created (admin/admin123)

## 🧪 Quick Tests (5-10 minutes)

### Test 1: Admin Login ✅
1. Open `http://localhost:5174`
2. Login: `admin` / `admin123`
3. Should see dashboard

### Test 2: Dashboard Statistics
1. After login, check dashboard
2. Should show:
   - Total tenants (probably 0)
   - Active licenses
   - System statistics

### Test 3: Create Test Tenant via API

Open PowerShell and run:

```powershell
$body = @{
    companyName = "Acme Corporation"
    email = "acme@example.com"
    adminUsername = "acmeadmin"
    adminPassword = "acme123"
    adminName = "Acme Admin"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3000/api/tenants/register" -Method Post -Body $body -ContentType "application/json"
$response | ConvertTo-Json
```

You should get:
```json
{
  "success": true,
  "tenantId": "tenant_...",
  "message": "Tenant registered successfully. Free 30-day trial started.",
  "trialDaysRemaining": 30
}
```

### Test 4: View Tenant in Admin Portal
1. Refresh admin portal
2. Go to "Tenants" section
3. Should see "Acme Corporation" in the list
4. Click "View" to see tenant details

### Test 5: Generate License
1. In admin portal, go to "Licenses"
2. Click "Generate License"
3. Select "Acme Corporation" from dropdown
4. Choose "Monthly" license type
5. Click "Generate License"
6. Copy the license key (format: MA-XXXXXXXX-XXXX)

### Test 6: Test License Activation (Future)
Once client app is updated, you can test activating the license.

## 📊 What You Should See

### Dashboard
- Total Tenants: 1 (after creating test tenant)
- Active Tenants: 1
- Trial Tenants: 1
- Expired Licenses: 0

### Tenants List
- Acme Corporation
- Email: acme@example.com
- License Type: trial
- Status: active

### Licenses List
- After generating, should see the license key
- Status: pending (until activated)
- Type: monthly

## 🎯 Next: Update Client Application

The main task remaining is updating the client application to:
1. Use API instead of direct database
2. Add tenant registration
3. Add license activation
4. Handle authentication

See `NEXT_STEPS.md` for detailed plan.

