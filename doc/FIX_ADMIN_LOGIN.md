# Fix Admin Login Issue

The login might be failing due to:
1. **Password hash mismatch** - The hash in SQL might not match 'admin123'
2. **Username case** - Must be exactly 'Admin' (capital A)
3. **is_active flag** - Must be TRUE
4. **API endpoint** - Frontend might not be calling the right URL

## Step 1: Verify Admin User in Database

Run this SQL in DBeaver:

```sql
SELECT id, username, email, role, is_active, 
       LENGTH(password) as password_length,
       LEFT(password, 7) as password_prefix
FROM admin_users 
WHERE username = 'Admin' OR username = 'admin';
```

**Check:**
- username should be exactly `Admin` (capital A)
- is_active should be `TRUE`
- password_length should be 60 (bcrypt hash length)
- password_prefix should be `$2a$10$` (bcrypt format)

## Step 2: Test Password Hash

The hash in the SQL might be incorrect. Let's regenerate it properly.

### Option A: Use the API Endpoint (Easiest)

The temporary endpoint will create the admin user with the correct password hash:

1. Make sure the endpoint is deployed
2. Call: `POST https://pbookspro-api.onrender.com/api/admin/create-admin`
3. This will create/update admin with correct password

### Option B: Generate New Hash and Update

1. Go to: https://bcrypt-generator.com/
2. Enter password: `admin123`
3. Rounds: `10`
4. Click "Generate Hash"
5. Copy the hash
6. Update in database:

```sql
UPDATE admin_users 
SET password = 'YOUR_NEW_HASH_HERE',
    is_active = TRUE,
    username = 'Admin'
WHERE id = 'admin_1';
```

## Step 3: Verify Login Query

The login checks:
- `username = 'Admin'` (exact match, case-sensitive)
- `is_active = TRUE`

Run this to verify:

```sql
SELECT * FROM admin_users 
WHERE username = 'Admin' AND is_active = TRUE;
```

Should return exactly one row.

## Step 4: Check API Endpoint

Verify the admin portal is calling the correct API:

1. Open browser Developer Tools (F12)
2. Go to Network tab
3. Try to login
4. Look for the login request
5. Check:
   - URL should be: `https://pbookspro-api.onrender.com/api/admin/auth/login`
   - Method: POST
   - Request body: `{"username":"Admin","password":"admin123"}`
   - Response status and error message

## Step 5: Test API Directly

Test the login endpoint directly:

```bash
curl -X POST https://pbookspro-api.onrender.com/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Admin","password":"admin123"}'
```

**Expected response:**
```json
{
  "token": "...",
  "admin": {
    "id": "admin_1",
    "username": "Admin",
    ...
  }
}
```

**If you get "Invalid credentials":**
- Password hash is wrong
- Username doesn't match
- is_active is FALSE

## Quick Fix: Reset Password Hash

Run this SQL to reset the password with a fresh hash:

```sql
-- First, generate a new hash at https://bcrypt-generator.com/
-- Password: admin123, Rounds: 10
-- Then replace HASH_HERE with the generated hash

UPDATE admin_users 
SET 
  password = 'HASH_HERE',
  is_active = TRUE,
  username = 'Admin',
  updated_at = NOW()
WHERE id = 'admin_1';
```

## Alternative: Use the Create-Admin Endpoint

If the endpoint is deployed:

```bash
curl -X POST https://pbookspro-api.onrender.com/api/admin/create-admin
```

This will create/update the admin user with the correct password hash automatically.

---

**Most likely issue:** The password hash in the SQL doesn't match 'admin123'. Use the API endpoint or generate a fresh hash.

