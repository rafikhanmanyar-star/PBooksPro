# How to Run SQL on Render Database

## Option 1: Use the Script (Easiest - Recommended)

You don't need psql! Just use the Node.js script with the correct database URL.

### Step 1: Get External Database URL

1. Go to **Render Dashboard**: https://dashboard.render.com
2. Click on **`pbookspro-db-staging`** database
3. Go to **"Info"** tab (or "Connections" tab)
4. Look for **"External Database URL"**
5. **Copy the entire URL** - it should look like:
   ```
   postgresql://pbookspro_staging:xxxxx@dpg-xxxxx-a.oregon-postgres.render.com:5432/pbookspro_staging
   ```
   ⚠️ **Important**: Must include `.render.com` in the hostname!

### Step 2: Create/Update Local .env File

1. **Navigate to server directory**:
   ```powershell
   cd server
   ```

2. **Check if .env file exists**:
   ```powershell
   dir .env
   ```

3. **Create or edit .env file**:
   ```powershell
   notepad .env
   ```
   
   Or use VS Code:
   ```powershell
   code .env
   ```

4. **Add these lines** (replace with your actual URL):
   ```env
   DATABASE_URL=postgresql://pbookspro_staging:YOUR_PASSWORD@dpg-xxxxx-a.oregon-postgres.render.com:5432/pbookspro_staging
   NODE_ENV=staging
   ```
   
   **Example** (replace with your actual values):
   ```env
   DATABASE_URL=postgresql://pbookspro_staging:abc123xyz@dpg-c7h9k2m3n4o5-a.oregon-postgres.render.com:5432/pbookspro_staging
   NODE_ENV=staging
   ```

5. **Save the file** (Ctrl+S)

### Step 3: Run the Script

```powershell
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

## Option 2: Install psql Locally (If you prefer SQL)

### Install PostgreSQL Client

**Windows (using Chocolatey)**:
```powershell
choco install postgresql
```

**Windows (using Scoop)**:
```powershell
scoop install postgresql
```

**Windows (Manual Install)**:
1. Download PostgreSQL from: https://www.postgresql.org/download/windows/
2. Install (this includes psql)
3. Or download just psql client: https://www.enterprisedb.com/download-postgresql-binaries

### Connect to Render Database

1. **Get External Database URL** from Render Dashboard (see Option 1, Step 1)

2. **Extract connection details** from the URL:
   ```
   postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE
   ```
   
   Example:
   ```
   postgresql://pbookspro_staging:mypass123@dpg-xxxxx-a.oregon-postgres.render.com:5432/pbookspro_staging
   ```
   
   - Username: `pbookspro_staging`
   - Password: `mypass123`
   - Host: `dpg-xxxxx-a.oregon-postgres.render.com`
   - Port: `5432`
   - Database: `pbookspro_staging`

3. **Connect using psql**:
   ```powershell
   psql -h dpg-xxxxx-a.oregon-postgres.render.com -p 5432 -U pbookspro_staging -d pbookspro_staging
   ```
   
   Or use the full URL:
   ```powershell
   psql "postgresql://pbookspro_staging:PASSWORD@dpg-xxxxx-a.oregon-postgres.render.com:5432/pbookspro_staging"
   ```

4. **Enter password when prompted**

5. **Run SQL commands**:
   ```sql
   -- Check if admin_users table exists
   \dt admin_users
   
   -- Check if admin user exists
   SELECT id, username, email, role FROM admin_users WHERE username = 'Admin';
   
   -- Create admin user
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
   
   -- Verify
   SELECT id, username, email, role, is_active FROM admin_users WHERE username = 'Admin';
   
   -- Exit
   \q
   ```

---

## Option 3: Use Render Web Console (If Available)

Some Render database plans include a web-based SQL console:

1. Go to Render Dashboard → `pbookspro-db-staging`
2. Look for **"Connect"**, **"SQL Console"**, or **"Query"** button
3. If available, click it to open a web-based SQL editor
4. Run the SQL commands from Option 2

**Note**: Not all Render database plans include this feature.

---

## Option 4: Use Online PostgreSQL Client

1. Go to: https://www.pgadmin.org/download/pgadmin-4-web/
   Or use: https://dbeaver.io/download/ (free database tool)

2. **DBeaver Setup** (Recommended):
   - Download and install DBeaver Community Edition
   - Open DBeaver
   - Click "New Database Connection"
   - Select "PostgreSQL"
   - Enter connection details from External Database URL:
     - Host: `dpg-xxxxx-a.oregon-postgres.render.com`
     - Port: `5432`
     - Database: `pbookspro_staging`
     - Username: `pbookspro_staging`
     - Password: (from your External URL)
   - Click "Test Connection" → "Finish"
   - Right-click database → "SQL Editor" → "New SQL Script"
   - Paste SQL commands and run

---

## Option 5: Check if Admin Already Exists (Recommended First Step!)

Before creating, check if admin user already exists via API:

### Check via Health/Logs

1. **Check API service logs**:
   - Go to Render Dashboard → `pbookspro-api-staging` → "Logs"
   - Look for: `✅ Admin user ready (username: Admin, password: admin123)`

2. **Try logging in**:
   - Go to: `https://pbookspro-admin-staging.onrender.com`
   - Username: `Admin`
   - Password: `admin123`
   - **If login works, admin user already exists!**

---

## Troubleshooting

### Script Error: "getaddrinfo ENOTFOUND base"

**Problem**: DATABASE_URL is wrong or missing

**Fix**:
1. Verify `.env` file exists in `server/` directory
2. Check DATABASE_URL includes `.render.com`
3. Make sure you're using **External Database URL** (not Internal)

### Script Error: "SSL/TLS required"

**Problem**: SSL not enabled (should be fixed in latest code)

**Fix**: Make sure you have the latest code with SSL fix, or:
- Add `NODE_ENV=staging` to `.env` file
- Script will auto-enable SSL for Render databases

### psql: "command not found"

**Problem**: PostgreSQL client not installed

**Fix**: Install PostgreSQL client (see Option 2)

### Connection Timeout

**Problem**: Database might be sleeping (Render free tier)

**Fix**:
1. Wait 30-60 seconds after first connection attempt
2. Database will wake up automatically
3. Subsequent connections will be faster

### Permission Denied

**Problem**: Wrong username/password or database name

**Fix**:
1. Double-check External Database URL from Render Dashboard
2. Verify username, password, and database name
3. Make sure you're using External URL (not Internal)

---

## Quick Reference: SQL to Create Admin User

```sql
-- Check existing admin users
SELECT id, username, email, role, is_active FROM admin_users WHERE username IN ('Admin', 'admin');

-- Create/Update admin user (password: admin123)
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

-- Verify
SELECT id, username, name, email, role, is_active, created_at 
FROM admin_users 
WHERE username = 'Admin';
```

---

## Recommended Approach

**For most users**: Use **Option 1** (the script) - it's the easiest and doesn't require installing anything extra!

1. Get External Database URL from Render
2. Add to `server/.env` file
3. Run `npm run create-admin`
4. Done! ✅
