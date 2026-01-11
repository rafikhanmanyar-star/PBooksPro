# Fix Orphaned Tenants (Tenant Exists But No User)

## Problem

After registration, some organizations (tenants) exist in the database but have no associated user accounts. This means:
- Organization is visible in admin portal
- But no user credentials exist to login to the client application
- Users cannot access their account

## Root Cause

The registration process creates the tenant first, then creates the user. If user creation fails for any reason, the tenant may remain in the database without a user (orphaned tenant).

## Solution 1: Check Existing Orphaned Tenants

### Check via SQL

Run this query to find tenants without users:

```sql
-- Find tenants without any users
SELECT 
  t.id,
  t.name,
  t.company_name,
  t.email,
  t.created_at,
  COUNT(u.id) as user_count
FROM tenants t
LEFT JOIN users u ON u.tenant_id = t.id
GROUP BY t.id, t.name, t.company_name, t.email, t.created_at
HAVING COUNT(u.id) = 0
ORDER BY t.created_at DESC;
```

### Check via Admin Portal

1. Go to Admin Portal → Tenants
2. Click on each tenant
3. Check "Users" tab
4. If no users are listed, that's an orphaned tenant

## Solution 2: Create User for Orphaned Tenant

### Option A: Use Admin Portal (Recommended)

1. **Go to Admin Portal**: `https://pbookspro-admin-staging.onrender.com`
2. **Navigate to Tenants**
3. **Click on the orphaned tenant**
4. **Go to "Users" tab**
5. **Click "Create User"**
6. **Fill in details**:
   - Username: (use the email or a username)
   - Name: Administrator
   - Email: (tenant email)
   - Password: (create a secure password)
   - Role: Admin
7. **Save**
8. **Share credentials with the tenant owner**

### Option B: Use SQL Directly

1. **Get tenant details**:
   ```sql
   SELECT id, name, company_name, email FROM tenants WHERE id = 'tenant_id_here';
   ```

2. **Create admin user**:
   ```sql
   -- Generate password hash first (use bcrypt with cost 10)
   -- Or use: https://bcrypt-generator.com/
   -- For password "TempPass123!", hash is: $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
   
   INSERT INTO users (id, tenant_id, username, name, role, password, email, is_active, created_at, updated_at)
   VALUES (
     'user_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 9),
     'tenant_id_here',
     'admin',  -- or use tenant email
     'Administrator',
     'Admin',
     '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',  -- Replace with actual hash
     'tenant_email@example.com',  -- Use tenant email
     TRUE,
     NOW(),
     NOW()
   );
   ```

3. **Verify user was created**:
   ```sql
   SELECT id, username, email, role, is_active FROM users WHERE tenant_id = 'tenant_id_here';
   ```

### Option C: Use API Script

Create a script to fix orphaned tenants:

```typescript
// scripts/fix-orphaned-tenants.ts
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function fixOrphanedTenants() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'staging' || process.env.NODE_ENV === 'production' 
      ? { rejectUnauthorized: false } 
      : false,
  });

  try {
    // Find tenants without users
    const orphanedTenants = await pool.query(`
      SELECT 
        t.id,
        t.name,
        t.company_name,
        t.email,
        t.created_at
      FROM tenants t
      LEFT JOIN users u ON u.tenant_id = t.id
      GROUP BY t.id, t.name, t.company_name, t.email, t.created_at
      HAVING COUNT(u.id) = 0
      ORDER BY t.created_at DESC
    `);

    console.log(`Found ${orphanedTenants.rows.length} orphaned tenant(s)`);

    for (const tenant of orphanedTenants.rows) {
      console.log(`\nFixing tenant: ${tenant.name} (${tenant.email})`);
      
      // Generate default password
      const defaultPassword = 'TempPass123!';
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create admin user
      await pool.query(
        `INSERT INTO users (id, tenant_id, username, name, role, password, email, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        [
          userId,
          tenant.id,
          tenant.email.split('@')[0], // Use email prefix as username
          'Administrator',
          'Admin',
          hashedPassword,
          tenant.email,
          true
        ]
      );
      
      console.log(`✅ Created user: ${tenant.email.split('@')[0]}`);
      console.log(`   Password: ${defaultPassword}`);
      console.log(`   ⚠️  Tenant owner must change password on first login!`);
    }

    console.log('\n✅ All orphaned tenants fixed!');
  } catch (error: any) {
    console.error('❌ Error fixing orphaned tenants:', error);
  } finally {
    await pool.end();
  }
}

fixOrphanedTenants();
```

Run it:
```bash
cd server
npm run tsx scripts/fix-orphaned-tenants.ts
```

## Solution 3: Prevent Future Orphaned Tenants

The code has been improved to:
1. ✅ Better error logging
2. ✅ Automatic tenant cleanup if user creation fails
3. ✅ User creation verification
4. ✅ Detailed error messages

After deploying the fix, new registrations should not create orphaned tenants.

## Verify Fix

After creating users for orphaned tenants:

1. **Test login to client app**:
   - Use tenant email to lookup organization
   - Use created username and password
   - Should be able to login

2. **Verify in admin portal**:
   - Go to tenant → Users tab
   - Should see the admin user listed

## Temporary Workaround

If tenant owner needs immediate access:

1. Create user via Admin Portal (see Solution 2, Option A)
2. Share credentials with tenant owner
3. Ask them to change password on first login

## Prevention

- ✅ Improved error handling in registration (deployed)
- ✅ Automatic cleanup of failed registrations
- ✅ Better logging for debugging

---

**Note**: If you see orphaned tenants, it means a previous registration failed during user creation. The new code should prevent this from happening again.
