# Create Admin User for Staging Environment

## Important: Admin User is Created Automatically!

The admin user is **automatically created** when the staging API server starts. The migration script (`run-migrations-on-startup.ts`) creates the default admin user.

**Default credentials:**
- Username: `Admin` (case-sensitive)
- Password: `admin123`

You should be able to log in to the staging admin portal with these credentials without running any script.

---

## If Admin User Doesn't Exist

If for some reason the admin user wasn't created, you have **3 options**:

### Option 1: Use API Endpoint (Easiest - if endpoint exists)

If the create-admin endpoint is available:

```bash
curl -X POST https://pbookspro-api-staging.onrender.com/api/admin/create-admin
```

This will create/update the admin user.

---

### Option 2: Run Script Locally (Requires Database URL)

1. **Get External Database URL from Render**:
   - Go to Render Dashboard
   - Click on `pbookspro-db-staging` database
   - Go to "Info" tab
   - Copy the **External Database URL** (should include `.render.com`)

2. **Set DATABASE_URL in local .env file**:
   - Go to `server/` directory
   - Create or edit `.env` file
   - Add:
     ```env
     DATABASE_URL=postgresql://user:password@dpg-xxx-a.oregon-postgres.render.com:5432/pbookspro_staging
     NODE_ENV=staging
     ```
   - Use the **External Database URL** you copied (NOT Internal URL)

3. **Run the script**:
   ```bash
   cd server
   npm run create-admin
   ```

**Expected output:**
```
👤 Creating admin user...
✅ Admin user created successfully!
   Username: admin
   Password: admin123
   ⚠️  Please change the password after first login!
```

---

### Option 3: Use Render Dashboard SQL Editor (Most Reliable)

1. **Go to Render Dashboard** → `pbookspro-db-staging` database
2. **Click "Connect"** or use "psql" if available
3. **Run this SQL**:

```sql
-- Check if admin_users table exists
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'admin_users';

-- Check if admin user exists
SELECT id, username, email, is_active, role 
FROM admin_users 
WHERE username = 'Admin' OR username = 'admin';

-- Create admin user (password: admin123)
-- Hash: $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
INSERT INTO admin_users (id, username, name, email, password, role, is_active, created_at, updated_at)
VALUES (
  'admin_1',
  'Admin',
  'Super Admin',
  'admin@pbookspro.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  'super_admin',
  TRUE,
  NOW(),
  NOW()
)
ON CONFLICT (username) DO UPDATE 
SET 
  password = EXCLUDED.password,
  is_active = TRUE,
  updated_at = NOW();

-- Verify admin user
SELECT id, username, name, email, role, is_active 
FROM admin_users 
WHERE username = 'Admin';
```

---

## Troubleshooting

### Error: "getaddrinfo ENOTFOUND base"

**Cause**: DATABASE_URL is malformed or missing

**Fix**:
1. Check `.env` file has correct DATABASE_URL
2. Use **External Database URL** (includes `.render.com`)
3. Format: `postgresql://user:password@host:5432/database`

### Error: "SSL/TLS required"

**Cause**: SSL not enabled for staging

**Fix**: This should be fixed in the latest code. If you still see this:
1. Make sure you're using the latest code
2. The script now automatically enables SSL for Render databases

### Error: "relation admin_users does not exist"

**Cause**: Migrations haven't run yet

**Fix**: 
1. Check API service logs - migrations should run automatically
2. Or run migrations manually in Render Dashboard SQL editor

---

## Default Admin Credentials

After creation, use:
- **Username**: `Admin` (case-sensitive - capital A)
- **Password**: `admin123`

**⚠️ IMPORTANT**: Change the password after first login!

---

## Verify Admin User Exists

**Check via SQL**:
```sql
SELECT id, username, email, role, is_active, created_at 
FROM admin_users 
WHERE username = 'Admin';
```

**Check via API** (if authenticated):
```
GET https://pbookspro-api-staging.onrender.com/api/admin/users
```

---

## Admin Portal Login

Once admin user exists:
1. Go to: `https://pbookspro-admin-staging.onrender.com`
2. Enter credentials:
   - Username: `Admin`
   - Password: `admin123`
3. After login, change password immediately!
