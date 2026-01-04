# Database Tools That Support Connection Strings

Here are database tools that can connect using a connection string directly:

## ✅ Recommended Tools (Support Connection Strings)

### 1. DBeaver (Free, Best Option) ⭐

**Download:** https://dbeaver.io/download/

**Why it's great:**
- ✅ Supports connection strings/URLs directly
- ✅ Free and open source
- ✅ Works on Windows, Mac, Linux
- ✅ Easy to use GUI
- ✅ Can paste full PostgreSQL URL

**How to connect:**
1. Open DBeaver
2. Click "New Database Connection" (plug icon)
3. Select **PostgreSQL**
4. In the connection dialog, look for **"URL"** tab or field
5. Paste your entire External Database URL:
   ```
   postgresql://username:password@host:port/database
   ```
6. Click "Test Connection"
7. Click "Finish"

**Alternative method in DBeaver:**
- Go to "Main" tab
- Fill in individual fields (it will auto-parse if you paste URL first)
- Or use "URL" field directly

---

### 2. TablePlus (Paid, Free Trial) ⭐

**Download:** https://tableplus.com/

**Why it's great:**
- ✅ Excellent connection string support
- ✅ Beautiful, modern UI
- ✅ Very easy to use
- ✅ Free trial available
- ✅ Works on Windows, Mac

**How to connect:**
1. Open TablePlus
2. Click "Create a new connection"
3. Select **PostgreSQL**
4. Click "Connect using URL" or paste URL in connection string field
5. Paste your External Database URL
6. Click "Connect"

---

### 3. DataGrip (JetBrains - Paid, Free Trial)

**Download:** https://www.jetbrains.com/datagrip/

**Why it's great:**
- ✅ Full connection string support
- ✅ Professional IDE for databases
- ✅ Very powerful
- ✅ Free 30-day trial

**How to connect:**
1. Open DataGrip
2. Click "+" → "Data Source" → "PostgreSQL"
3. In connection settings, look for "URL" field
4. Paste your External Database URL
5. Click "Test Connection"
6. Click "OK"

---

### 4. Postico (Mac Only - Paid, Free Trial)

**Download:** https://eggerapps.at/postico/

**Why it's great:**
- ✅ Mac-native, beautiful UI
- ✅ Supports connection strings
- ✅ Very user-friendly

**How to connect:**
1. Open Postico
2. Click "New Favorite"
3. Paste connection string in URL field
4. Connect

---

### 5. Azure Data Studio (Free, Microsoft)

**Download:** https://aka.ms/azuredatastudio

**Why it's great:**
- ✅ Free and open source
- ✅ Supports PostgreSQL via extension
- ✅ Connection string support
- ✅ Cross-platform

**How to connect:**
1. Install PostgreSQL extension
2. Create new connection
3. Use connection string format

---

### 6. Beekeeper Studio (Free, Open Source)

**Download:** https://www.beekeeperstudio.io/

**Why it's great:**
- ✅ Free and open source
- ✅ Modern UI
- ✅ Connection string support
- ✅ Cross-platform

**How to connect:**
1. Click "New Connection"
2. Select PostgreSQL
3. Paste connection string or fill fields

---

### 7. Adminer (Web-based, Free)

**Access:** https://www.adminer.org/ or host locally

**Why it's great:**
- ✅ Web-based (no installation)
- ✅ Single PHP file
- ✅ Supports connection strings
- ✅ Very lightweight

**How to use:**
1. Download adminer.php
2. Run it locally or on a server
3. Select PostgreSQL
4. Enter connection details or use connection string

---

## 🎯 Best Recommendations

### For Easiest Use:
1. **DBeaver** - Free, supports URLs, very popular
2. **TablePlus** - Beautiful UI, great connection string support

### For Professional Use:
1. **DataGrip** - Full-featured IDE
2. **TablePlus** - Modern and powerful

### For Quick Access:
1. **Beekeeper Studio** - Free, modern
2. **Adminer** - Web-based, no install

---

## Quick Start: DBeaver (Recommended)

Since DBeaver is free and widely used:

1. **Download:** https://dbeaver.io/download/
2. **Install** DBeaver
3. **Open** DBeaver
4. **Click** "New Database Connection" (plug icon in toolbar)
5. **Select** "PostgreSQL"
6. **In the connection dialog:**
   - Go to "Main" tab
   - **Paste your External Database URL** in the "URL" field at the bottom
   - OR fill in:
     - Host: `dpg-xxxxx-a.oregon-postgres.render.com`
     - Port: `5432`
     - Database: `pbookspro`
     - Username: `pbookspro_user`
     - Password: `your_password`
7. **Click** "Test Connection"
8. **Click** "Finish"

---

## Alternative: Use Command Line (psql)

If you have PostgreSQL client installed locally:

```bash
# Connect directly using URL
psql "postgresql://username:password@host:port/database"

# Then run SQL:
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

## Still Having Issues?

If connection string parsing isn't working in any tool:

1. **Extract components manually** (see `PARSE_DATABASE_URL.md`)
2. **Fill in fields individually** instead of using URL
3. **Use the API endpoint method** (easiest - see `EASIEST_CREATE_ADMIN.md`)

---

**My Top Pick:** **DBeaver** - It's free, supports connection strings well, and is very reliable.

