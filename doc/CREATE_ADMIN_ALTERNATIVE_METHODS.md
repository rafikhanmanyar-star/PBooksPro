# Alternative Methods to Create Admin User (Without psql)

Since psql is not available in Render's Connect button, here are alternative methods:

## Method 1: Use External Database URL with Local Client (Recommended)

### Step 1: Get External Database URL

1. Go to Render Dashboard → Your Database (`pbookspro-db`)
2. Go to **Connections** tab
3. Copy the **External Database URL** (not Internal)
   - Format: `postgresql://user:password@host:port/database`

### Step 2: Connect Using Local Tool

#### Option A: Using psql (if installed locally)

```bash
# Connect using the External Database URL
psql "postgresql://user:password@host:port/database"

# Then run the SQL:
INSERT INTO admin_users (id, username, name, email, password, role, is_active, created_at, updated_at)
VALUES (
  'admin_1',
  'Admin2',
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

#### Option B: Using pgAdmin (GUI Tool)

1. Download pgAdmin: https://www.pgadmin.org/download/
2. Install and open pgAdmin
3. Right-click "Servers" → "Create" → "Server"
4. In "Connection" tab:
   - **EASIEST:** Look for "Connection String" or "URL" field and paste the entire External Database URL
   - **OR manually extract:**
     - **Host:** The part between `@` and `:` (e.g., `dpg-xxxxx-a.oregon-postgres.render.com`)
     - **Port:** The number between `:` and `/` (usually `5432`)
     - **Database:** The part after the last `/` (e.g., `pbookspro`)
     - **Username:** The part between `://` and `:` (e.g., `pbookspro_user`)
     - **Password:** The part between the first `:` and `@` (e.g., `abc123xyz`)
   
   **Example URL:** `postgresql://pbookspro_user:abc123xyz@dpg-xxxxx-a.oregon-postgres.render.com:5432/pbookspro`
   
   See `PARSE_DATABASE_URL.md` for detailed breakdown.
5. Connect
6. Right-click database → "Query Tool"
7. Run the SQL INSERT command

#### Option C: Using DBeaver (Free GUI Tool)

1. Download DBeaver: https://dbeaver.io/download/
2. Install and open DBeaver
3. Click "New Database Connection" → PostgreSQL
4. Enter connection details from External Database URL
5. Connect
6. Open SQL Editor
7. Run the SQL INSERT command

#### Option D: Using Online Tool (pgAdmin Web)

Some online PostgreSQL clients can connect using the External Database URL.

## Method 2: Create Temporary API Endpoint

Add a temporary endpoint to create the admin user:

### Step 1: Add Endpoint to Server

Create `server/api/routes/admin/create-admin.ts`:

```typescript
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getDatabaseService } from '../../../services/databaseService.js';

const router = Router();

router.post('/create-admin', async (req, res) => {
  try {
    const db = getDatabaseService();
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    await db.query(
      `INSERT INTO admin_users (id, username, name, email, password, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (username) DO UPDATE 
       SET password = EXCLUDED.password, is_active = TRUE, updated_at = NOW()`,
      ['admin_1', 'Admin', 'Super Admin', 'admin@pbookspro.com', hashedPassword, 'super_admin', true]
    );
    
    res.json({ success: true, message: 'Admin user created' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

### Step 2: Add Route to Admin Router

In `server/api/routes/admin/index.ts`, add:

```typescript
import createAdminRouter from './create-admin.js';
router.use('/create-admin', createAdminRouter);
```

### Step 3: Call the Endpoint

```bash
curl -X POST https://pbookspro-api.onrender.com/api/admin/create-admin
```

### Step 4: Remove After Use

Delete the endpoint after creating the admin user for security.

## Method 3: Use Render Shell (If Available)

If Render provides shell access to your API service:

1. Go to API Service → **Shell** tab (if available)
2. Run:
   ```bash
   cd server
   npm run reset-admin
   ```

## Method 4: Run Script via Render Console

If Render has a console/terminal:

1. Go to API Service
2. Look for "Console" or "Terminal" option
3. Run the reset-admin script

## Method 5: Use Node.js Script Locally

Create a script to connect and create admin:

### Create `create-admin-remote.js`:

```javascript
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || 'YOUR_EXTERNAL_DATABASE_URL_HERE';

async function createAdmin() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    await pool.query(
      `INSERT INTO admin_users (id, username, name, email, password, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (username) DO UPDATE 
       SET password = EXCLUDED.password, is_active = TRUE, updated_at = NOW()`,
      ['admin_1', 'Admin', 'Super Admin', 'admin@pbookspro.com', hashedPassword, 'super_admin', true]
    );
    
    console.log('✅ Admin user created!');
    console.log('Username: Admin');
    console.log('Password: admin123');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

createAdmin();
```

### Run it:

```bash
# Set DATABASE_URL to your External Database URL
export DATABASE_URL="postgresql://user:password@host:port/database"
node create-admin-remote.js
```

## Recommended: Method 1 (pgAdmin or DBeaver)

The easiest is using a GUI tool like pgAdmin or DBeaver:

1. **Get External Database URL** from Render
2. **Connect using the tool**
3. **Run the SQL** to create admin user
4. **Done!**

## Quick SQL Command

Once connected (using any method above), run:

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

**Note:** If the hash doesn't work, generate a new one at https://bcrypt-generator.com/ with password `admin123` and 10 rounds.

---

**Which method do you prefer?** I recommend Method 1 with pgAdmin or DBeaver - it's the easiest GUI approach.

