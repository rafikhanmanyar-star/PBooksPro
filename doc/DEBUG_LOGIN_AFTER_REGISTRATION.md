# Debug Login Issue After Registration

If login fails after registering a new organization, follow these steps:

## Quick Diagnostic Steps

### 1. Check Server Logs

Look for these log messages in the server console:

```
🔐 Unified login attempt: { orgEmail: '...', username: '...', hasPassword: true }
🔍 Looking up tenant by email: ...
📊 Tenant lookup result: { tenantsFound: X, ... }
🔍 Looking up user: { username: '...', tenantId: '...' }
📊 User lookup result: { usersFound: X, ... }
```

**What to check:**
- `tenantsFound: 0` → Tenant not found (email mismatch)
- `usersFound: 0` → User not found (username mismatch or wrong tenant)
- `usersFound: 1` but login still fails → Password issue

### 2. Run Diagnostic SQL Script

1. **Open DBeaver** and connect to staging database
2. **Open** `server/scripts/diagnose-login-issue.sql`
3. **Replace placeholders:**
   - `'YOUR_EMAIL'` → The organization email you used during registration
   - `'YOUR_USERNAME'` → The username you used during registration
   - `'YOUR_TENANT_ID'` → The tenant ID from Step 1 results
4. **Run each step** and check the results

### 3. Common Issues and Fixes

#### Issue 1: Tenant Not Found

**Symptoms:**
- `tenantsFound: 0` in logs
- "Invalid organization email, username, or password" error

**Causes:**
- Email case mismatch (e.g., `Test@Company.com` vs `test@company.com`)
- Extra spaces in email
- Wrong email entered

**Fix:**
```sql
-- Check what email is actually in the database
SELECT id, email, LOWER(TRIM(email)) as normalized_email
FROM tenants 
ORDER BY created_at DESC 
LIMIT 5;

-- Use the exact email from the database (case-insensitive is fine, but check for spaces)
```

#### Issue 2: User Not Found

**Symptoms:**
- `tenantsFound: 1` but `usersFound: 0` in logs
- "Invalid organization email, username, or password" error

**Causes:**
- Username case mismatch
- Extra spaces in username
- Wrong username entered
- User created in different tenant

**Fix:**
```sql
-- Check what users exist for the tenant
SELECT id, username, email, is_active, created_at
FROM users 
WHERE tenant_id = 'YOUR_TENANT_ID'
ORDER BY created_at DESC;

-- Use the exact username from the database
```

#### Issue 3: Password Mismatch

**Symptoms:**
- `usersFound: 1` but login still fails
- Password verification fails

**Causes:**
- Password hash corrupted during registration
- Wrong password entered

**Fix:**
```sql
-- Check password hash format
SELECT 
    username,
    LENGTH(password) as password_length,
    LEFT(password, 7) as password_prefix
FROM users 
WHERE tenant_id = 'YOUR_TENANT_ID' 
  AND LOWER(TRIM(username)) = LOWER(TRIM('YOUR_USERNAME'));

-- Should return: password_length: 60, password_prefix: $2a$10$

-- Reset password if needed
UPDATE users
SET 
    password = '$2a$10$ZWxizEWeh2zZyW6Z6R.TYuOAjV1TmfJy1PBGevR47H9nU4WUbz.Hy',  -- admin123
    updated_at = NOW()
WHERE tenant_id = 'YOUR_TENANT_ID' 
  AND LOWER(TRIM(username)) = LOWER(TRIM('YOUR_USERNAME'));
```

#### Issue 4: User Inactive

**Symptoms:**
- `usersFound: 1` but login fails with "Account disabled"

**Causes:**
- `is_active` is `FALSE` instead of `TRUE`

**Fix:**
```sql
-- Check is_active status
SELECT username, is_active 
FROM users 
WHERE tenant_id = 'YOUR_TENANT_ID' 
  AND LOWER(TRIM(username)) = LOWER(TRIM('YOUR_USERNAME'));

-- Activate user if needed
UPDATE users
SET 
    is_active = TRUE,
    updated_at = NOW()
WHERE tenant_id = 'YOUR_TENANT_ID' 
  AND LOWER(TRIM(username)) = LOWER(TRIM('YOUR_USERNAME'));
```

#### Issue 5: Email Mismatch Between Tenant and User

**Symptoms:**
- Tenant found, but user lookup fails when searching by email

**Causes:**
- User's email doesn't match tenant email
- User email is NULL or different

**Fix:**
```sql
-- Check email mismatch
SELECT 
    t.email as tenant_email,
    u.email as user_email,
    u.username
FROM tenants t
LEFT JOIN users u ON u.tenant_id = t.id
WHERE t.id = 'YOUR_TENANT_ID';

-- Fix user email to match tenant email
UPDATE users
SET 
    email = (SELECT email FROM tenants WHERE id = 'YOUR_TENANT_ID'),
    updated_at = NOW()
WHERE tenant_id = 'YOUR_TENANT_ID' 
  AND LOWER(TRIM(username)) = LOWER(TRIM('YOUR_USERNAME'));
```

## Complete Diagnostic Query

Run this to see everything at once:

```sql
-- Replace 'YOUR_EMAIL' and 'YOUR_USERNAME' with actual values
WITH tenant_info AS (
    SELECT id, name, email, LOWER(TRIM(email)) as normalized_email
    FROM tenants 
    WHERE LOWER(TRIM(email)) = LOWER(TRIM('YOUR_EMAIL'))
)
SELECT 
    t.id as tenant_id,
    t.name as tenant_name,
    t.email as tenant_email,
    t.license_status as tenant_status,
    u.id as user_id,
    u.username,
    u.email as user_email,
    u.role,
    u.is_active,
    LENGTH(u.password) as password_length,
    LEFT(u.password, 7) as password_prefix,
    CASE 
        WHEN u.id IS NULL THEN '❌ User not found'
        WHEN u.is_active = FALSE THEN '❌ User inactive'
        WHEN LENGTH(u.password) != 60 THEN '❌ Invalid password hash'
        WHEN LEFT(u.password, 7) != '$2a$10$' THEN '❌ Invalid password format'
        ELSE '✅ User looks good'
    END as status
FROM tenant_info t
LEFT JOIN users u ON u.tenant_id = t.id 
    AND (
        LOWER(TRIM(u.username)) = LOWER(TRIM('YOUR_USERNAME'))
        OR LOWER(TRIM(u.email)) = LOWER(TRIM('YOUR_USERNAME'))
    );
```

## Registration Flow Verification

The registration process should:
1. ✅ Create tenant with email
2. ✅ Create user with:
   - `tenant_id` matching tenant
   - `username` as provided
   - `email` matching tenant email
   - `password` as bcrypt hash
   - `is_active = TRUE`
   - `role = 'Admin'`

If any of these are missing or incorrect, login will fail.

## Still Having Issues?

1. **Check server logs** for detailed error messages
2. **Run the diagnostic SQL script** and share results
3. **Verify registration was successful** - check if tenant and user exist
4. **Check for transaction rollback** - if registration failed partway through, tenant might exist but user might not
