import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';

dotenv.config();

async function testAdminLogin() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('🧪 Testing admin login...\n');

    // Get admin user
    const result = await pool.query(
      'SELECT * FROM admin_users WHERE username = $1',
      ['admin']
    );

    if (result.rows.length === 0) {
      console.log('❌ Admin user not found');
      await pool.end();
      return;
    }

    const admin = result.rows[0];
    console.log('✅ Admin user found:');
    console.log(`   ID: ${admin.id}`);
    console.log(`   Username: ${admin.username}`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   Role: ${admin.role}`);
    console.log(`   Active: ${admin.is_active}\n`);

    // Test password
    const testPassword = 'admin123';
    const passwordMatch = await bcrypt.compare(testPassword, admin.password);
    
    if (passwordMatch) {
      console.log('✅ Password verification: SUCCESS');
      console.log('   Password "admin123" matches!');
    } else {
      console.log('❌ Password verification: FAILED');
      console.log('   Password "admin123" does NOT match!');
      console.log('   Run: npm run reset-admin');
    }

    console.log('\n📝 Login Credentials:');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    console.log('\n💡 If login still fails, check:');
    console.log('   1. Backend server is running on port 3000');
    console.log('   2. Admin portal is calling correct API endpoint');
    console.log('   3. CORS is configured correctly');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

testAdminLogin()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

