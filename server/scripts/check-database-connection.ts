/**
 * Check database connection and validate DATABASE_URL
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

async function checkConnection() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    console.log('\n💡 Create a .env file in the server folder with:');
    console.log('   DATABASE_URL=postgresql://postgres:your_password@localhost:5432/pbookspro');
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL;
  console.log('🔍 Checking DATABASE_URL...');

  // Validate format
  if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
    console.error('❌ Invalid DATABASE_URL format');
    console.error('   Expected: postgresql://username:password@host:port/database');
    console.error('   Got:', dbUrl.substring(0, 50) + '...');
    process.exit(1);
  }

  // Parse URL to validate
  try {
    const url = new URL(dbUrl);
    console.log('✅ URL format is valid');
    console.log('   Host:', url.hostname);
    console.log('   Port:', url.port || '5432 (default)');
    console.log('   Database:', url.pathname.substring(1));
    console.log('   Username:', url.username);

    if (!url.hostname || url.hostname === 'base') {
      console.error('❌ Invalid hostname in DATABASE_URL');
      console.error('   Hostname cannot be "base" or empty');
      process.exit(1);
    }
  } catch (error: any) {
    console.error('❌ Failed to parse DATABASE_URL:', error.message);
    process.exit(1);
  }

  // Test connection
  console.log('\n🔗 Testing database connection...');

  // Enable SSL for production, staging, and any Render database URLs
  const shouldUseSSL = process.env.NODE_ENV === 'production' ||
    process.env.NODE_ENV === 'staging' ||
    (dbUrl && dbUrl.includes('.render.com'));

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: shouldUseSSL ? { rejectUnauthorized: false } : false,
  });

  try {
    const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('✅ Database connection successful!');
    console.log('   Current time:', result.rows[0].current_time);
    console.log('   PostgreSQL version:', result.rows[0].pg_version.split(' ')[0] + ' ' + result.rows[0].pg_version.split(' ')[1]);

    // Check if database exists and has tables
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    if (tablesResult.rows.length > 0) {
      console.log(`\n📊 Found ${tablesResult.rows.length} tables in database:`);
      tablesResult.rows.slice(0, 10).forEach(row => {
        console.log('   -', row.table_name);
      });
      if (tablesResult.rows.length > 10) {
        console.log(`   ... and ${tablesResult.rows.length - 10} more`);
      }
    } else {
      console.log('\n📊 Database is empty (no tables found)');
      console.log('   Run migration: npm run migrate');
    }

  } catch (error: any) {
    console.error('❌ Database connection failed:', error.message);
    if (error.code === 'ENOTFOUND') {
      console.error('\n💡 Possible issues:');
      console.error('   1. Hostname is incorrect in DATABASE_URL');
      console.error('   2. Database server is not running');
      console.error('   3. Network connectivity issue');
    } else if (error.code === '28P01') {
      console.error('\n💡 Authentication failed:');
      console.error('   1. Check username and password in DATABASE_URL');
      console.error('   2. Verify PostgreSQL user exists');
    } else if (error.code === '3D000') {
      console.error('\n💡 Database does not exist:');
      console.error('   1. Create database: createdb -U postgres pbookspro');
      console.error('   2. Or update DATABASE_URL with correct database name');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkConnection()
  .then(() => {
    console.log('\n✅ All checks passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Check failed:', error);
    process.exit(1);
  });

