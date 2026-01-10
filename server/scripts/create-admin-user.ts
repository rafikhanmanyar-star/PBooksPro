import { Pool } from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

async function createAdminUser() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // Enable SSL for production, staging, and any Render database URLs
  const shouldUseSSL = process.env.NODE_ENV === 'production' || 
                       process.env.NODE_ENV === 'staging' ||
                       (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('.render.com'));

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: shouldUseSSL ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('👤 Creating admin user...');

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

    // Check if admin user already exists
    const existing = await pool.query(
      'SELECT id, username, email, role, is_active FROM admin_users WHERE username = $1 OR id = $2',
      ['Admin', 'admin_1']
    );

    if (existing.rows.length > 0) {
      const existingUser = existing.rows[0];
      console.log('⚠️  Admin user already exists:');
      console.log(`   ID: ${existingUser.id}`);
      console.log(`   Username: ${existingUser.username}`);
      console.log(`   Email: ${existingUser.email}`);
      console.log(`   Role: ${existingUser.role}`);
      console.log(`   Active: ${existingUser.is_active}`);
      console.log('');
      console.log('🔄 Resetting password to: admin123');
    }

    // Create or update admin user (reset password)
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    await pool.query(
      `INSERT INTO admin_users (id, username, name, email, password, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE 
       SET 
         username = EXCLUDED.username,
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         password = EXCLUDED.password,
         role = EXCLUDED.role,
         is_active = TRUE,
         updated_at = NOW()`,
      [
        'admin_1',
        'Admin',
        'Super Admin',
        'admin@pbookspro.com',
        hashedPassword,
        'super_admin',
        true
      ]
    );

    console.log('✅ Admin user ready!');
    console.log('   Username: Admin');
    console.log('   Password: admin123');
    console.log('   ⚠️  Please change the password after first login!');

  } catch (error: any) {
    console.error('❌ Error creating admin user:', error.message);
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

createAdminUser()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

