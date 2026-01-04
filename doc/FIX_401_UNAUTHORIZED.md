# Fix 401 Unauthorized Error

The 401 error means authentication failed. This usually means:
1. Admin user doesn't exist
2. Password is wrong
3. Username doesn't match (case-sensitive)
4. User is inactive (is_active = false)

## Quick Fix: Create/Update Admin User

Use the create-admin endpoint to ensure the admin user exists with the correct password:

### Option 1: Using curl

```bash
curl -X POST https://pbookspro-api.onrender.com/api/admin/create-admin
```

### Option 2: Using Browser/Postman

1. **URL:** `https://pbookspro-api.onrender.com/api/admin/create-admin`
2. **Method:** `POST`
3. **No body needed**

**Expected response:**
```json
{
  "success": true,
  "message": "Admin user created successfully",
  "username": "Admin",
  "password": "admin123"
}
```

## After Creating Admin User

1. **Try login again:**
   - Username: `Admin` (capital A)
   - Password: `admin123`

2. **If still fails**, check:
   - Username is exactly `Admin` (case-sensitive)
   - Password is exactly `admin123`
   - No extra spaces

## Verify Admin User in Database

If you have DBeaver access, verify:

```sql
SELECT id, username, email, role, is_active, 
       CASE WHEN password IS NULL THEN 'NULL' ELSE 'SET' END as password_status
FROM admin_users 
WHERE username = 'Admin';
```

**Should show:**
- username: `Admin`
- is_active: `TRUE`
- password_status: `SET`

## Check API Logs

Check Render Dashboard → **pbookspro-api** → **Logs** for:
- `Admin login error:` - might show more details
- Any database connection errors

---

**Most likely fix: Use the create-admin endpoint to create/update the admin user!**

