/**
 * Script to ensure all admin users are active
 * Run this to fix any admin users that might have is_active = NULL or FALSE
 */

import dotenv from 'dotenv';
import { Pool } from 'pg';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

async function fixAdminUsers() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('🔧 Fixing admin users to ensure they are active...');

    // Update all users with role 'Admin' to have is_active = TRUE
    const result = await pool.query(
      `UPDATE users 
       SET is_active = TRUE, updated_at = NOW()
       WHERE role = 'Admin' AND (is_active IS NULL OR is_active = FALSE)
       RETURNING id, username, name, email, role, is_active`
    );

    if (result.rows.length > 0) {
      console.log(`✅ Fixed ${result.rows.length} admin user(s):`);
      result.rows.forEach((user: any) => {
        console.log(`   - ${user.username} (${user.email || 'no email'}) - Now active`);
      });
    } else {
      console.log('✅ All admin users are already active');
    }

    // Also check and report all admin users
    const allAdmins = await pool.query(
      `SELECT id, username, name, email, role, is_active, tenant_id 
       FROM users 
       WHERE role = 'Admin'
       ORDER BY created_at DESC`
    );

    console.log(`\n📊 Total admin users in database: ${allAdmins.rows.length}`);
    allAdmins.rows.forEach((admin: any) => {
      const status = admin.is_active ? '✅ Active' : '❌ Inactive';
      console.log(`   ${status} - ${admin.username} (${admin.email || 'no email'}) - Tenant: ${admin.tenant_id}`);
    });

  } catch (error: any) {
    console.error('❌ Error fixing admin users:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fixAdminUsers()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

export { fixAdminUsers };

