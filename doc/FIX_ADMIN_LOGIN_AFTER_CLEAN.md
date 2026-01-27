# Fix Admin Login After Database Clean

After cleaning the staging database, the admin user needs to be recreated. This guide will help you create an admin user that can login to the admin portal.

## The Problem

After running `clean-staging-db.sql`, all data is deleted except WhatsApp tables. The admin user needs to be recreated with:
- Correct username: **"Admin"** (capital A, case-sensitive)
- Correct password hash for "admin123"
- `is_active = TRUE`

## Solution: Use the Fixed SQL Script

### Option 1: Use the Fixed SQL Script (Recommended)

1. **Open DBeaver** and connect to your **STAGING** database
2. **Open** the file: `server/scripts/create-admin-user-working.sql`
3. **Execute** the entire script (F5 or Execute button)

The script will:
- Delete any existing admin users
- Create a fresh admin user with correct password hash
- Verify the user was created correctly

### Option 2: Quick Copy-Paste

Copy and paste this into DBeaver:

```sql
-- Delete existing admin
DELETE FROM admin_users WHERE id = 'admin_1' OR username IN ('Admin', 'admin');

-- Create fresh admin user
INSERT INTO admin_users (
    id, username, name, email, password, role, is_active, created_at, updated_at
)
VALUES (
    'admin_1',
    'Admin',  -- Must be exactly "Admin" (capital A)
    'Super Admin',
    'admin@pbookspro.com',
    '$2a$10$ZWxizEWeh2zZyW6Z6R.TYuOAjV1TmfJy1PBGevR47H9nU4WUbz.Hy',  -- admin123
    'super_admin',
    TRUE,  -- Must be TRUE
    NOW(),
    NOW()
);

-- Verify
SELECT id, username, is_active, LENGTH(password) as pwd_len
FROM admin_users WHERE username = 'Admin' AND is_active = TRUE;
```

## Login Credentials

- **Username**: `Admin` (capital A)
- **Password**: `admin123`

## Verification Steps

After running the script, verify the admin user:

### 1. Check the user exists and is active

```sql
SELECT * 
FROM admin_users 
WHERE username = 'Admin' AND is_active = TRUE;
```

**Should return exactly 1 row**

### 2. Verify password hash format

```sql
SELECT 
    username,
    LENGTH(password) as password_length,
    LEFT(password, 7) as password_prefix
FROM admin_users 
WHERE username = 'Admin';
```

**Expected:**
- `password_length`: 60
- `password_prefix`: `$2a$10$`

### 3. Test login query (same as API uses)

```sql
SELECT * 
FROM admin_users 
WHERE username = 'Admin' AND is_active = TRUE;
```

**Should return 1 row with:**
- `username`: `Admin`
- `is_active`: `TRUE`
- `password`: 60-character bcrypt hash starting with `$2a$10$`

## Common Issues

### Issue 1: "Invalid credentials" error

**Cause**: Username case mismatch or `is_active` is not TRUE

**Fix**:
```sql
-- Check current state
SELECT username, is_active FROM admin_users WHERE LOWER(username) = 'admin';

-- Fix if needed
UPDATE admin_users 
SET username = 'Admin', is_active = TRUE 
WHERE id = 'admin_1';
```

### Issue 2: Password hash is wrong

**Cause**: The hash in the SQL doesn't match "admin123"

**Fix**: Use the script `create-admin-user-working.sql` which has a fresh, verified hash

### Issue 3: Admin user doesn't exist

**Cause**: Table was truncated or user was deleted

**Fix**: Run the complete script from `create-admin-user-working.sql`

## Why the Original Script Failed

The original `create-admin-direct.sql` had these issues:

1. **ON CONFLICT clause**: May not work if there's no unique constraint on `username`
2. **Old password hash**: The hash might not match "admin123" correctly
3. **No cleanup**: Didn't delete existing users first, which could cause conflicts

## The Fixed Script

The new `create-admin-user-working.sql` script:

1. ✅ **Deletes existing admin first** - Clean slate
2. ✅ **Uses fresh password hash** - Generated and verified
3. ✅ **Sets is_active = TRUE** - Required for login
4. ✅ **Uses exact username "Admin"** - Case-sensitive match
5. ✅ **Includes verification queries** - Check everything is correct

## Still Having Issues?

If login still fails after running the fixed script:

1. **Check server logs** - Look for authentication errors
2. **Verify JWT_SECRET** - Make sure it's set in environment variables
3. **Check database connection** - Ensure API can connect to database
4. **Test the login query directly** - Run the SELECT query in DBeaver

Run this diagnostic query:

```sql
SELECT 
    id,
    username,
    is_active,
    LENGTH(password) as pwd_len,
    LEFT(password, 7) as pwd_prefix,
    CASE 
        WHEN username = 'Admin' AND is_active = TRUE THEN '✅ Ready for login'
        WHEN username != 'Admin' THEN '❌ Wrong username case'
        WHEN is_active != TRUE THEN '❌ Not active'
        ELSE '❌ Unknown issue'
    END as status
FROM admin_users 
WHERE id = 'admin_1' OR username IN ('Admin', 'admin');
```
