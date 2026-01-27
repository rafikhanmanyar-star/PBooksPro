# Login Options After Database Clean

After cleaning the staging database, you have two login options:

## Option 1: Admin Portal Login (Recommended)

The admin account you created is for the **admin portal**, not the regular user portal.

### Steps:
1. **Navigate to the admin portal:**
   - Local: `http://localhost:5174` (or your admin portal URL)
   - Staging: Your admin portal URL

2. **Login with admin credentials:**
   - **Username**: `Admin` (capital A)
   - **Password**: `admin123`

3. **Endpoint used**: `/api/admin/auth/login`

### Admin Portal Features:
- Manage tenants
- View all organizations
- Manage licenses
- System administration

---

## Option 2: Regular User Portal Login

The regular user portal (`CloudLoginPage`) requires:
- **Organization Email** (tenant email)
- **Username** (regular user)
- **Password**

Since the database was cleaned, you need to create a tenant and user first.

### Quick Setup:

#### Method A: Use SQL Script (Fastest)

1. **Open DBeaver** and connect to staging database
2. **Run** `server/scripts/create-test-tenant-and-user.sql`
3. **Login with:**
   - Organization Email: `test@company.com`
   - Username: `admin`
   - Password: `admin123`

#### Method B: Register via UI

1. **Go to the login page**
2. **Click "Register New Organization (Free Trial)"**
3. **Fill in the registration form:**
   - Company Name: Your company name
   - Organization Email: Your email
   - Admin Username: Your username
   - Admin Password: Your password
   - Admin Name: Your name
4. **Submit** - This creates a tenant and admin user automatically

### Endpoint used: `/api/auth/unified-login`

---

## Summary

| Portal | Endpoint | Requires | Credentials |
|--------|----------|----------|-------------|
| **Admin Portal** | `/api/admin/auth/login` | Username + Password | `Admin` / `admin123` |
| **User Portal** | `/api/auth/unified-login` | Org Email + Username + Password | Create tenant/user first |

---

## Troubleshooting

### "Invalid credentials" on Admin Portal

1. **Verify admin user exists:**
   ```sql
   SELECT * FROM admin_users WHERE username = 'Admin' AND is_active = TRUE;
   ```

2. **Check password hash:**
   ```sql
   SELECT username, LENGTH(password) as pwd_len, LEFT(password, 7) as prefix
   FROM admin_users WHERE username = 'Admin';
   ```
   - Should return: `pwd_len: 60`, `prefix: $2a$10$`

3. **Reset admin password:**
   - Run `server/scripts/create-admin-user-working.sql` again

### "Invalid credentials" on User Portal

1. **Check if tenant exists:**
   ```sql
   SELECT * FROM tenants WHERE email = 'test@company.com';
   ```

2. **Check if user exists:**
   ```sql
   SELECT * FROM users WHERE username = 'admin' AND tenant_id = 'tenant_test_1';
   ```

3. **Create tenant and user:**
   - Run `server/scripts/create-test-tenant-and-user.sql`

---

## Quick Reference

### Admin Portal
- **URL**: Admin portal URL (separate from main app)
- **Login**: `Admin` / `admin123`
- **Script**: `server/scripts/create-admin-user-working.sql`

### User Portal
- **URL**: Main app URL
- **Login**: Create tenant/user first
- **Script**: `server/scripts/create-test-tenant-and-user.sql`
