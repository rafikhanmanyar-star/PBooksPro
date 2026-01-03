import { Pool } from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

async function resetAdminPassword() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('🔐 Resetting admin password...');

    // Check if admin_users table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'admin_users'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('❌ admin_users table does not exist. Please run migration first:');
      console.log('   cd server && npm run migrate');
      await pool.end();
      return;
    }

    // Check if Admin user exists (with capital A as requested)
    const existingAdmin = await pool.query(
      'SELECT id, username FROM admin_users WHERE username = $1',
      ['Admin']
    );

    // Also check if there's any admin user with ID admin_1 or username 'admin' (lowercase)
    const anyAdmin = await pool.query(
      'SELECT id, username FROM admin_users WHERE id = $1 OR LOWER(username) = $2',
      ['admin_1', 'admin']
    );

    if (existingAdmin.rows.length > 0) {
      // Admin user with capital A already exists, just update password
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.query(
        `UPDATE admin_users 
         SET password = $1, is_active = TRUE, updated_at = NOW()
         WHERE username = $2`,
        [hashedPassword, 'Admin']
      );
      console.log('✅ Admin password reset!');
    } else if (anyAdmin.rows.length > 0) {
      // There's an existing admin user (probably with lowercase 'admin'), update it
      const existingId = anyAdmin.rows[0].id;
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.query(
        `UPDATE admin_users 
         SET username = $1, password = $2, is_active = TRUE, updated_at = NOW()
         WHERE id = $3`,
        ['Admin', hashedPassword, existingId]
      );
      console.log('✅ Admin user updated to username "Admin" with password reset!');
    } else {
      // No admin user exists, create new one
      console.log('❌ Admin user does not exist. Creating new admin user...');
      
      // Create admin user with username "Admin" (capital A)
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.query(
        `INSERT INTO admin_users (id, username, name, email, password, role)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          'admin_1',
          'Admin',
          'Super Admin',
          'admin@pbookspro.com',
          hashedPassword,
          'super_admin'
        ]
      );
      console.log('✅ Admin user created!');
    }

    console.log('\n📝 Login Credentials:');
    console.log('   Username: Admin');
    console.log('   Password: admin123');
    console.log('   ⚠️  Please change the password after first login!');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('relation "admin_users" does not exist')) {
      console.log('\n💡 Run database migration first:');
      console.log('   cd server && npm run migrate');
    }
  } finally {
    if (!pool.ended) {
      await pool.end();
    }
  }
}

resetAdminPassword()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

