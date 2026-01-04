# Fix DBeaver Connection Error

The error "Invalid JDBC URL" happens because:
1. DBeaver needs **JDBC format** (not standard PostgreSQL URL)
2. Your URL is **missing the port number**

## Solution 1: Use Individual Fields (Easiest) ✅

Instead of using the URL field, fill in the fields individually:

### Step 1: Extract Components from Your URL

Your URL:
```
postgresql://pbookspro_user:t3P8ZvpcgrpGce6IsgPzsOj9vE6AgOdD@dpg-d5ced2h5pdvs73c8s4c0-a.virginia-postgres.render.com/pbookspro
```

**Breakdown:**
- **Username:** `pbookspro_user`
- **Password:** `t3P8ZvpcgrpGce6IsgPzsOj9vE6AgOdD`
- **Host:** `dpg-d5ced2h5pdvs73c8s4c0-a.virginia-postgres.render.com`
- **Port:** `5432` (default PostgreSQL port - not in URL but needed)
- **Database:** `pbookspro`

### Step 2: Fill in DBeaver Connection Fields

1. Open DBeaver
2. Click "New Database Connection" (plug icon)
3. Select **PostgreSQL**
4. In the connection dialog, go to **"Main"** tab
5. Fill in these fields:
   - **Host:** `dpg-d5ced2h5pdvs73c8s4c0-a.virginia-postgres.render.com`
   - **Port:** `5432`
   - **Database:** `pbookspro`
   - **Username:** `pbookspro_user`
   - **Password:** `t3P8ZvpcgrpGce6IsgPzsOj9vE6AgOdD`
6. **Check:** "Show all databases" (optional)
7. Click **"Test Connection"**
8. If successful, click **"Finish"**

---

## Solution 2: Convert to JDBC URL Format

If you want to use the URL field, convert it to JDBC format:

### Your Current URL:
```
postgresql://pbookspro_user:t3P8ZvpcgrpGce6IsgPzsOj9vE6AgOdD@dpg-d5ced2h5pdvs73c8s4c0-a.virginia-postgres.render.com/pbookspro
```

### JDBC Format (for DBeaver):
```
jdbc:postgresql://dpg-d5ced2h5pdvs73c8s4c0-a.virginia-postgres.render.com:5432/pbookspro
```

**Note:** 
- Add `jdbc:` prefix
- Add port `:5432` after host
- Remove username/password from URL (enter separately)

### How to Use JDBC URL in DBeaver:

1. Open DBeaver
2. Click "New Database Connection"
3. Select **PostgreSQL**
4. Go to **"Main"** tab
5. In **"JDBC URL"** field, paste:
   ```
   jdbc:postgresql://dpg-d5ced2h5pdvs73c8s4c0-a.virginia-postgres.render.com:5432/pbookspro
   ```
6. Enter credentials separately:
   - **Username:** `pbookspro_user`
   - **Password:** `t3P8ZvpcgrpGce6IsgPzsOj9vE6AgOdD`
7. Click **"Test Connection"**
8. Click **"Finish"**

---

## Solution 3: Complete JDBC URL with Credentials (Not Recommended)

You can include credentials in JDBC URL, but it's less secure:

```
jdbc:postgresql://dpg-d5ced2h5pdvs73c8s4c0-a.virginia-postgres.render.com:5432/pbookspro?user=pbookspro_user&password=t3P8ZvpcgrpGce6IsgPzsOj9vE6AgOdD
```

**Format:**
```
jdbc:postgresql://host:port/database?user=username&password=password
```

---

## Quick Reference: Your Connection Details

Use these exact values in DBeaver:

- **Host:** `dpg-d5ced2h5pdvs73c8s4c0-a.virginia-postgres.render.com`
- **Port:** `5432`
- **Database:** `pbookspro`
- **Username:** `pbookspro_user`
- **Password:** `t3P8ZvpcgrpGce6IsgPzsOj9vE6AgOdD`

---

## Recommended: Use Individual Fields

**Best approach:** Don't use the URL field at all. Just fill in the individual fields in DBeaver's connection dialog. It's easier and more reliable.

---

## After Connecting

Once connected, you can run the SQL to create the admin user:

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

---

**Try Solution 1 first** - it's the easiest and most reliable method!

