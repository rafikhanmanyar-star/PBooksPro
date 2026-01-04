# Quick: Create Admin User in Render Database

## Fastest Method

1. **Go to Render Dashboard**
   - https://dashboard.render.com
   - Click your database: `pbookspro-db`

2. **Open psql Console**
   - Click **"Connections"** tab
   - Click **"Connect"** → **"psql"**

3. **Run This SQL** (copy and paste):

```sql
-- Create admin user with password 'admin123'
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
SET password = EXCLUDED.password, is_active = TRUE, updated_at = NOW();
```

4. **Verify**:

```sql
SELECT username, is_active FROM admin_users WHERE username = 'Admin';
```

Should show: `Admin | TRUE`

5. **Login**
   - Go to: `https://pbookspro-admin.onrender.com`
   - Username: `Admin`
   - Password: `admin123`

## If That Doesn't Work

The password hash might be different. Generate a new one:

1. Go to: https://bcrypt-generator.com/
2. Password: `admin123`
3. Rounds: `10`
4. Copy the hash
5. Replace the hash in the SQL above

## Check Server Logs

If the migration script should have created it, check API service logs:
- Render Dashboard → API Service → Logs
- Look for: "✅ Admin user ready" or migration errors

---

**That's it!** The admin user should now exist and you can login.

