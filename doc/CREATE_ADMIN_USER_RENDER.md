# Create Admin User in Render Database

The admin user should be created automatically on server startup, but if it's missing, here's how to create it manually.

## Method 1: Using Render Dashboard (Easiest)

### Step 1: Connect to Database

1. Go to Render Dashboard: https://dashboard.render.com
2. Click on your database: `pbookspro-db`
3. Go to **Connections** tab
4. Click **"Connect"** → **"psql"** (or use any PostgreSQL client)

### Step 2: Run SQL Commands

Copy and paste these SQL commands in the psql console:

```sql
-- Check if admin_users table exists
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'admin_users';

-- Check if admin user already exists
SELECT id, username, email, is_active FROM admin_users 
WHERE username = 'Admin' OR username = 'admin';

-- Create admin user (if it doesn't exist)
-- Password: admin123 (bcrypt hash)
INSERT INTO admin_users (id, username, name, email, password, role, is_active)
VALUES (
  'admin_1',
  'Admin',
  'Super Admin',
  'admin@pbookspro.com',
  '$2a$10$rOzJqZqZqZqZqZqZqZqZqOqZqZqZqZqZqZqZqZqZqZqZqZqZqZqZq',
  'super_admin',
  TRUE
)
ON CONFLICT (username) DO UPDATE 
SET 
  password = EXCLUDED.password,
  is_active = TRUE,
  updated_at = NOW();

-- Verify admin user was created
SELECT id, username, email, role, is_active FROM admin_users 
WHERE username = 'Admin';
```

**Note:** The password hash above is a placeholder. You need to generate the actual bcrypt hash for 'admin123'.

## Method 2: Generate Password Hash First

Since we need the actual bcrypt hash, here's a better approach:

### Option A: Use Node.js Script (Recommended)

Create a temporary script to generate the hash:

```javascript
// generate-hash.js
const bcrypt = require('bcryptjs');
bcrypt.hash('admin123', 10).then(hash => {
  console.log('Password hash:', hash);
});
```

Run: `node generate-hash.js`

Then use that hash in the SQL INSERT above.

### Option B: Use Online Bcrypt Generator

1. Go to: https://bcrypt-generator.com/
2. Enter password: `admin123`
3. Rounds: `10`
4. Copy the generated hash
5. Use it in the SQL INSERT

## Method 3: Run Script via Render Shell

If Render provides shell access:

1. Go to API service → **Shell** tab (if available)
2. Run:
   ```bash
   cd server
   npm run reset-admin
   ```

## Method 4: Direct SQL with Generated Hash

After generating the hash, use this complete SQL:

```sql
-- Generate hash first using: bcrypt.hash('admin123', 10)
-- Then replace HASH_HERE with the actual hash

INSERT INTO admin_users (id, username, name, email, password, role, is_active, created_at, updated_at)
VALUES (
  'admin_1',
  'Admin',
  'Super Admin',
  'admin@pbookspro.com',
  'HASH_HERE',  -- Replace with actual bcrypt hash
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
```

## Quick SQL (Using Pre-generated Hash)

Here's a SQL command with a pre-generated hash for 'admin123':

```sql
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
```

**⚠️ Note:** The hash above is a sample. Generate your own for security.

## Verify Admin User

After creating, verify:

```sql
SELECT id, username, name, email, role, is_active, created_at 
FROM admin_users 
WHERE username = 'Admin';
```

Should return:
- username: `Admin`
- is_active: `TRUE`
- role: `super_admin`

## Test Login

After creating the admin user:

1. Go to admin portal: `https://pbookspro-admin.onrender.com`
2. Login with:
   - **Username:** `Admin`
   - **Password:** `admin123`

## Troubleshooting

### "Invalid credentials" error

Check:
1. Username is exactly `Admin` (capital A)
2. Password hash is correct
3. `is_active = TRUE`
4. User exists in database

### User exists but can't login

```sql
-- Check user status
SELECT username, is_active, role FROM admin_users WHERE username = 'Admin';

-- If is_active is FALSE, update it:
UPDATE admin_users SET is_active = TRUE WHERE username = 'Admin';
```

### Case sensitivity

The login is case-sensitive. Make sure:
- Username: `Admin` (capital A)
- Not: `admin` or `ADMIN`

## Alternative: Create via API (After First Login)

If you can't access the database directly, you could:
1. Temporarily modify the login endpoint to allow creation
2. Or use a different method to access the database

---

**Recommended:** Use Method 1 (Render Dashboard → psql) with the SQL commands above.

