# Easiest Way to Create Admin User

Since psql is not available in Render, here's the **easiest method**:

## Method: Use Temporary API Endpoint

I've created a temporary endpoint that you can call to create the admin user.

### Step 1: The endpoint is already added

The endpoint is now in your codebase. After you push and deploy, you can use it.

### Step 2: Call the endpoint

Once your API is deployed, run this command:

```bash
curl -X POST https://pbookspro-api.onrender.com/api/admin/create-admin
```

Or use a browser/Postman:
- URL: `https://pbookspro-api.onrender.com/api/admin/create-admin`
- Method: `POST`
- No body needed

### Step 3: Verify

You should get a response:
```json
{
  "success": true,
  "message": "Admin user created successfully",
  "username": "Admin",
  "password": "admin123"
}
```

### Step 4: Login

- Go to: `https://pbookspro-admin.onrender.com`
- Username: `Admin`
- Password: `admin123`

### Step 5: Remove the endpoint (IMPORTANT!)

After creating the admin user, **remove the endpoint for security**:

1. Delete `server/api/routes/admin/create-admin.ts`
2. Remove the import and route from `server/api/routes/admin/index.ts`
3. Commit and push

## Alternative: Use Database GUI Tool

If you prefer not to use the endpoint:

1. **Download pgAdmin or DBeaver** (free GUI tools)
2. **Get External Database URL** from Render Dashboard → Database → Connections
3. **Connect** using the External Database URL
4. **Run SQL**:

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
SET password = EXCLUDED.password, is_active = TRUE, updated_at = NOW();
```

**Note:** If the hash doesn't work, generate a new one at https://bcrypt-generator.com/ (password: `admin123`, rounds: `10`)

---

**Recommended:** Use the API endpoint method - it's the easiest and doesn't require installing any tools!

