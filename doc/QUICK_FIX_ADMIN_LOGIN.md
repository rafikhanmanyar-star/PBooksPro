# Quick Fix: Admin Login Not Working

The password hash in the database might not match 'admin123'. Here's the quickest fix:

## Solution: Use the API Endpoint (Easiest) ✅

The `create-admin` endpoint will generate a fresh password hash and update the admin user.

### Step 1: Call the Endpoint

**Using curl:**
```bash
curl -X POST https://pbookspro-api.onrender.com/api/admin/create-admin
```

**Or using browser/Postman:**
- URL: `https://pbookspro-api.onrender.com/api/admin/create-admin`
- Method: `POST`
- No body needed

### Step 2: Verify Response

You should get:
```json
{
  "success": true,
  "message": "Admin user created successfully",
  "username": "Admin",
  "password": "admin123"
}
```

### Step 3: Try Login Again

- Go to: `https://pbookspro-admin.onrender.com`
- Username: `Admin`
- Password: `admin123`

## Alternative: Generate New Hash Manually

If the endpoint isn't available:

1. **Go to:** https://bcrypt-generator.com/
2. **Enter:** Password = `admin123`, Rounds = `10`
3. **Click:** "Generate Hash"
4. **Copy** the hash
5. **Run this SQL in DBeaver:**

```sql
UPDATE admin_users 
SET 
  password = 'PASTE_GENERATED_HASH_HERE',
  is_active = TRUE,
  username = 'Admin',
  updated_at = NOW()
WHERE id = 'admin_1';
```

6. **Try login again**

## Verify Admin User

Before fixing, check the current state:

```sql
SELECT id, username, is_active, 
       LENGTH(password) as hash_length
FROM admin_users 
WHERE username = 'Admin';
```

**Should show:**
- username: `Admin`
- is_active: `TRUE`
- hash_length: `60`

## Test Login API Directly

To see the exact error:

```bash
curl -X POST https://pbookspro-api.onrender.com/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Admin","password":"admin123"}'
```

**If you get "Invalid credentials":**
- Password hash is wrong → Use the endpoint or update hash
- Username doesn't match → Check it's exactly 'Admin'
- is_active is FALSE → Update it to TRUE

---

**Recommended:** Use the API endpoint - it will fix the password hash automatically!

